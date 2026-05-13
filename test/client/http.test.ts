import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { requestJson } from '../../src/client/http.ts';
import { createMockServer, jsonResponse } from '../helpers/mock-server.ts';
import type { Config } from '../../src/config/schema.ts';
import { ExitCode } from '../../src/errors/codes.ts';
import { CLIError } from '../../src/errors/base.ts';

function makeConfig(baseUrl: string, overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-api-key',
    fileApiKey: undefined,
    configPath: '/tmp/test-config.json',
    multimodalBaseUrl: baseUrl,
    llmBaseUrl: baseUrl,
    output: 'json',
    timeout: 5,
    verbose: false,
    quiet: true,
    noColor: true,
    yes: false,
    dryRun: false,
    nonInteractive: true,
    async: false,
    ...overrides,
  };
}

describe('HTTP client', () => {
  it('makes authenticated GET request and returns JSON', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/test': (_req, _body) => jsonResponse({ result: 'ok' }),
      },
    });
    after(() => server.close());

    const config = makeConfig(server.url);
    const result = await requestJson<{ result: string }>(config, {
      url: `${server.url}/v1/test`,
    });
    assert.strictEqual(result.result, 'ok');
  });

  it('injects Authorization header', async () => {
    let capturedAuth = '';
    const server = await createMockServer({
      routes: {
        '/v1/auth-check': (req, _body) => {
          capturedAuth = req.headers.authorization ?? '';
          return jsonResponse({ ok: true });
        },
      },
    });
    after(() => server.close());

    const config = makeConfig(server.url, { apiKey: 'sk-test-abc' });
    await requestJson(config, { url: `${server.url}/v1/auth-check` });
    assert.strictEqual(capturedAuth, 'Bearer sk-test-abc');
  });

  it('uses SAC_API_KEY env var as fallback when no apiKey in config', async () => {
    let capturedAuth = '';
    const server = await createMockServer({
      routes: {
        '/v1/env-key': (req, _body) => {
          capturedAuth = req.headers.authorization ?? '';
          return jsonResponse({ ok: true });
        },
      },
    });
    after(() => server.close());

    const originalEnv = process.env.SAC_API_KEY;
    process.env.SAC_API_KEY = 'sk-from-env';
    const config = makeConfig(server.url, { apiKey: undefined, fileApiKey: undefined });
    try {
      await requestJson(config, { url: `${server.url}/v1/env-key` });
      assert.strictEqual(capturedAuth, 'Bearer sk-from-env');
    } finally {
      if (originalEnv === undefined) delete process.env.SAC_API_KEY;
      else process.env.SAC_API_KEY = originalEnv;
    }
  });

  it('makes POST request with JSON body', async () => {
    let receivedBody = '';
    const server = await createMockServer({
      routes: {
        '/v1/post': (_req, body) => {
          receivedBody = body;
          return jsonResponse({ echo: JSON.parse(body) });
        },
      },
    });
    after(() => server.close());

    const config = makeConfig(server.url);
    const result = await requestJson<{ echo: unknown }>(config, {
      url: `${server.url}/v1/post`,
      method: 'POST',
      body: { hello: 'world' },
    });
    assert.deepStrictEqual(result.echo, { hello: 'world' });
    assert.deepStrictEqual(JSON.parse(receivedBody), { hello: 'world' });
  });

  it('throws CLIError with AUTH exit code on 401', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/secure': (_req, _body) => jsonResponse({ error: 'unauthorized' }, 401),
      },
    });
    after(() => server.close());

    const config = makeConfig(server.url);
    await assert.rejects(
      () => requestJson(config, { url: `${server.url}/v1/secure` }),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.AUTH);
        return true;
      },
    );
  });

  it('throws CLIError with QUOTA exit code on 429', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/quota': (_req, _body) => jsonResponse({ message: 'too many requests' }, 429),
      },
    });
    after(() => server.close());

    const config = makeConfig(server.url);
    await assert.rejects(
      () => requestJson(config, { url: `${server.url}/v1/quota` }),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.QUOTA);
        return true;
      },
    );
  });

  it('throws CLIError when no API key is set', async () => {
    const server = await createMockServer({
      routes: { '/v1/any': (_req, _body) => jsonResponse({}) },
    });
    after(() => server.close());

    const config = makeConfig(server.url, { apiKey: undefined, fileApiKey: undefined });
    await assert.rejects(
      () => requestJson(config, { url: `${server.url}/v1/any` }),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.AUTH);
        return true;
      },
    );
  });
});
