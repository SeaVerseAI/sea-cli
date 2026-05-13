import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import modelGetCommand from '../../../src/commands/model/get.ts';
import type { Config } from '../../../src/config/schema.ts';
import { CLIError } from '../../../src/errors/base.ts';
import { ExitCode } from '../../../src/errors/codes.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-api-key',
    fileApiKey: undefined,
    configPath: '/tmp/test.json',
    multimodalBaseUrl: 'https://api.example.com',
    llmBaseUrl: 'https://api.example.com',
    output: 'text',
    timeout: 10,
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

function makeFlags(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    quiet: true,
    verbose: false,
    noColor: true,
    yes: false,
    dryRun: false,
    help: false,
    nonInteractive: true,
    async: false,
    ...overrides,
  };
}

const originalFetch = globalThis.fetch;
const originalWrite = process.stdout.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalWrite;
});

describe('model get command', () => {
  it('requires a model id positional argument', async () => {
    await assert.rejects(
      () => modelGetCommand.execute(makeConfig(), makeFlags({ _positional: [] })),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.match(err.message, /Model name is required/);
        assert.match(err.hint ?? '', /sac model get <model>/);
        return true;
      },
    );
  });

  it('writes the raw skill markdown to stdout and URL-encodes the model id', async () => {
    let requestedUrl = '';
    let requestedHeaders: Record<string, string> = {};
    const chunks: string[] = [];

    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedHeaders = init?.headers as Record<string, string>;
      return new Response('# Model Skill\n\nBody Template...', {
        status: 200,
        headers: { 'Content-Type': 'text/markdown' },
      });
    }) as typeof fetch;

    await modelGetCommand.execute(
      makeConfig(),
      makeFlags({ _positional: ['kling v3/i2v'] }),
    );

    assert.strictEqual(chunks.join(''), '# Model Skill\n\nBody Template...');
    const url = new URL(requestedUrl);
    assert.strictEqual(url.origin, 'https://api.example.com');
    assert.strictEqual(url.pathname, '/v1/models/skill/kling%20v3%2Fi2v');
    assert.strictEqual(requestedHeaders.Authorization, 'Bearer test-api-key');
    assert.strictEqual(requestedHeaders['User-Agent']?.startsWith('sac-cli/'), true);
  });

  it('returns a not-found error when the model is missing', async () => {
    globalThis.fetch = (async () => new Response('Not found', { status: 404 })) as typeof fetch;

    await assert.rejects(
      () => modelGetCommand.execute(makeConfig(), makeFlags({ _positional: ['missing_model'] })),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.GENERAL);
        assert.match(err.message, /Model "missing_model" not found/);
        assert.match(err.hint ?? '', /sac model search/);
        return true;
      },
    );
  });

  it('fails with a network error when the gateway is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;

    await assert.rejects(
      () => modelGetCommand.execute(makeConfig(), makeFlags({ _positional: ['kling_v3'] })),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.NETWORK);
        assert.match(err.message, /Cannot reach gateway/);
        return true;
      },
    );
  });

  it('maps authentication failures through the shared HTTP client', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: { message: 'missing authentication token' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

    await assert.rejects(
      () => modelGetCommand.execute(makeConfig(), makeFlags({ _positional: ['kling_v3'] })),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.AUTH);
        assert.match(err.message, /Authentication failed/);
        assert.match(err.message, /HTTP 401/);
        return true;
      },
    );
  });
});
