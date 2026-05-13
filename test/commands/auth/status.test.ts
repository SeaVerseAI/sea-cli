import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import authStatusCommand from '../../../src/commands/auth/status.ts';
import type { Config } from '../../../src/config/schema.ts';
import { createMockServer, jsonResponse } from '../../helpers/mock-server.ts';

function makeConfig(baseUrl: string, overrides: Partial<Config> = {}): Config {
  return {
    apiKey: undefined,
    fileApiKey: undefined,
    configPath: '/tmp/test-config.json',
    baseUrl,
    baseUrlSource: 'config',
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

describe('auth status command', () => {
  it('emits JSON for unauthenticated state', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await authStatusCommand.execute(makeConfig('https://api.example.com'), makeFlags());
    } finally {
      console.log = origLog;
    }

    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.authenticated, false);
  });

  it('recognizes SAC_API_KEY from the environment', async () => {
    const originalEnv = process.env.SAC_API_KEY;
    process.env.SAC_API_KEY = 'env-key';
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await authStatusCommand.execute(makeConfig('https://api.example.com'), makeFlags());
    } finally {
      console.log = origLog;
      if (originalEnv === undefined) delete process.env.SAC_API_KEY;
      else process.env.SAC_API_KEY = originalEnv;
    }

    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.authenticated, true);
    assert.strictEqual(parsed.source, 'SAC_API_KEY env var');
    assert.deepStrictEqual(parsed.gateway, {
      base_url: 'https://api.example.com',
      source: 'config file',
    });
  });

  it('reports --base-url as the gateway source in JSON output', async () => {
    const originalEnv = process.env.SAC_API_KEY;
    process.env.SAC_API_KEY = 'env-key';
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await authStatusCommand.execute(
        makeConfig('https://flag.example.com/model', {
          baseUrl: 'https://flag.example.com',
          baseUrlSource: 'flag',
        }),
        makeFlags(),
      );
    } finally {
      console.log = origLog;
      if (originalEnv === undefined) delete process.env.SAC_API_KEY;
      else process.env.SAC_API_KEY = originalEnv;
    }

    const parsed = JSON.parse(logs.join(''));
    assert.deepStrictEqual(parsed.gateway, {
      base_url: 'https://flag.example.com',
      source: '--base-url flag',
    });
  });

  it('includes remote verification when --check is passed', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'task not found' }, 404),
      },
    });
    after(() => server.close());

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await authStatusCommand.execute(
        makeConfig(server.url, { apiKey: 'test-key' }),
        makeFlags({ check: true }),
      );
    } finally {
      console.log = origLog;
      process.exitCode = 0;
    }

    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.verification.status, 'valid');
  });
});
