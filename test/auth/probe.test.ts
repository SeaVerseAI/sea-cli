import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { probeApiKey } from '../../src/auth/probe.ts';
import { createMockServer, jsonResponse } from '../helpers/mock-server.ts';
import type { Config } from '../../src/config/schema.ts';

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

describe('API key probe', () => {
  it('treats 404 task lookup as a valid key', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'task not found' }, 404),
      },
    });
    after(() => server.close());

    const result = await probeApiKey(makeConfig(server.url));
    assert.strictEqual(result.status, 'valid');
    assert.strictEqual(result.httpStatus, 404);
  });

  it('treats 401 task lookup as an invalid key', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'unauthorized' }, 401),
      },
    });
    after(() => server.close());

    const result = await probeApiKey(makeConfig(server.url));
    assert.strictEqual(result.status, 'invalid');
    assert.strictEqual(result.httpStatus, 401);
  });

  it('treats non-auth non-not-found errors as unknown', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'gateway failure' }, 502),
      },
    });
    after(() => server.close());

    const result = await probeApiKey(makeConfig(server.url));
    assert.strictEqual(result.status, 'unknown');
    assert.strictEqual(result.httpStatus, 502);
  });

  it('treats task-not-found messages on non-404 statuses as a valid key', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'Task not found.' }, 400),
      },
    });
    after(() => server.close());

    const result = await probeApiKey(makeConfig(server.url));
    assert.strictEqual(result.status, 'valid');
    assert.strictEqual(result.httpStatus, 400);
  });
});
