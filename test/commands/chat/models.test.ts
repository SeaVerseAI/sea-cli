import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import chatModelsCommand from '../../../src/commands/chat/models.ts';
import type { Config } from '../../../src/config/schema.ts';
import { createMockServer, jsonResponse } from '../../helpers/mock-server.ts';

function makeConfig(baseUrl: string, overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-key',
    fileApiKey: undefined,
    configPath: '/tmp/test.json',
    multimodalBaseUrl: baseUrl,
    llmBaseUrl: baseUrl,
    output: 'json',
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

async function createModelsServer() {
  const server = await createMockServer({
    routes: {
      '/v1/models': () => jsonResponse({
        object: 'list',
        data: [
          { id: 'deepseek-v3-0324', object: 'model', created: 1, owned_by: 'seaart' },
          { id: 'claude-sonnet-4-6', object: 'model', created: 1, owned_by: 'seaart' },
        ],
      }),
    },
  });
  after(() => server.close());
  return server;
}

describe('chat models command', () => {
  it('returns structured JSON in quiet mode', async () => {
    const server = await createModelsServer();
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatModelsCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags(),
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as { models: string[] };
    assert.deepStrictEqual(parsed.models, ['deepseek-v3-0324', 'claude-sonnet-4-6']);
  });

  it('returns newline-delimited text in quiet text mode', async () => {
    const server = await createModelsServer();
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatModelsCommand.execute(
        makeConfig(server.url, { output: 'text', quiet: true }),
        makeFlags(),
      );
    } finally {
      console.log = orig;
    }

    assert.strictEqual(logs.join(''), 'deepseek-v3-0324\nclaude-sonnet-4-6');
  });

  it('prints summary to stderr in non-quiet text mode', async () => {
    const server = await createModelsServer();
    const logs: string[] = [];
    const errs: string[] = [];
    const origLog = console.log;
    const origErr = process.stderr.write;
    console.log = (msg: string) => { logs.push(msg); };
    process.stderr.write = ((chunk: string | Uint8Array) => {
      errs.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      await chatModelsCommand.execute(
        makeConfig(server.url, { output: 'text', quiet: false }),
        makeFlags({ quiet: false }),
      );
    } finally {
      console.log = origLog;
      process.stderr.write = origErr;
    }

    assert.strictEqual(logs.join(''), 'deepseek-v3-0324\nclaude-sonnet-4-6');
    assert.ok(errs.join('').includes('2 model(s)'));
  });

  it('applies --filter in JSON mode', async () => {
    const server = await createModelsServer();
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await chatModelsCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ filter: 'claude' }),
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as { models: string[] };
    assert.deepStrictEqual(parsed.models, ['claude-sonnet-4-6']);
  });
});
