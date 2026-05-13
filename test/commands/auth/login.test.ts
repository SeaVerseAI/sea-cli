import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import authLoginCommand from '../../../src/commands/auth/login.ts';
import type { Config } from '../../../src/config/schema.ts';
import { CLIError } from '../../../src/errors/base.ts';
import { ExitCode } from '../../../src/errors/codes.ts';
import { createMockServer, jsonResponse } from '../../helpers/mock-server.ts';

function makeConfig(baseUrl: string, overrides: Partial<Config> = {}): Config {
  return {
    apiKey: undefined,
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

describe('auth login command', () => {
  it('refuses to save an invalid key', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'unauthorized' }, 401),
      },
    });
    after(() => server.close());

    const homeDir = mkdtempSync(join(tmpdir(), 'sac-login-invalid-'));
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await assert.rejects(
        () => authLoginCommand.execute(
          makeConfig(server.url),
          makeFlags({ apiKey: 'bad-key' }),
        ),
        (err: unknown) => {
          assert.ok(err instanceof CLIError);
          assert.strictEqual(err.exitCode, ExitCode.AUTH);
          return true;
        },
      );

      assert.strictEqual(existsSync(join(homeDir, '.sac', 'config.json')), false);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('saves the key after a successful probe', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'task not found' }, 404),
      },
    });
    after(() => server.close());

    const homeDir = mkdtempSync(join(tmpdir(), 'sac-login-valid-'));
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await authLoginCommand.execute(
        makeConfig(server.url),
        makeFlags({ apiKey: 'good-key' }),
      );

      const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as { api_key?: string };
      assert.strictEqual(saved.api_key, 'good-key');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('saves the key when probe returns a task-not-found message on a non-404 status', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': () => jsonResponse({ message: 'Task not found.' }, 400),
      },
    });
    after(() => server.close());

    const homeDir = mkdtempSync(join(tmpdir(), 'sac-login-task-not-found-'));
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await authLoginCommand.execute(
        makeConfig(server.url),
        makeFlags({ apiKey: 'good-key' }),
      );

      const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as { api_key?: string };
      assert.strictEqual(saved.api_key, 'good-key');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('returns JSON in dry-run mode', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await authLoginCommand.execute(
        makeConfig('https://api.example.com', { dryRun: true, output: 'json' }),
        makeFlags({ apiKey: 'good-key', dryRun: true }),
      );
    } finally {
      console.log = origLog;
    }

    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.would_validate, true);
    assert.strictEqual(parsed.would_save, true);
  });

  it('normalizes and persists --base-url after a successful probe', async () => {
    const server = await createMockServer({
      routes: {
        '/model/v1/generation/task/': () => jsonResponse({ message: 'task not found' }, 404),
      },
    });
    after(() => server.close());

    const homeDir = mkdtempSync(join(tmpdir(), 'sac-login-base-url-'));
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;

    try {
      await authLoginCommand.execute(
        makeConfig('', { multimodalBaseUrl: '', llmBaseUrl: '' }),
        makeFlags({ apiKey: 'good-key', baseUrl: `${server.url}/model` }),
      );

      const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as {
        api_key?: string;
        base_url?: string;
      };
      assert.strictEqual(saved.api_key, 'good-key');
      assert.strictEqual(saved.base_url, server.url);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('requires a configured gateway base URL before validating a key', async () => {
    await assert.rejects(
      () => authLoginCommand.execute(
        makeConfig('', { multimodalBaseUrl: '', llmBaseUrl: '' }),
        makeFlags({ apiKey: 'good-key' }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.match(err.message, /Gateway base URL is required/);
        return true;
      },
    );
  });

  it('persists the explicit login key even when SAC_API_KEY is also set', async () => {
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/': (req) => {
          if (req.headers.authorization === 'Bearer login-key') {
            return jsonResponse({ message: 'task not found' }, 404);
          }
          return jsonResponse({ message: 'unauthorized' }, 401);
        },
      },
    });
    after(() => server.close());

    const homeDir = mkdtempSync(join(tmpdir(), 'sac-login-flag-priority-'));
    const originalHome = process.env.HOME;
    const originalEnvKey = process.env.SAC_API_KEY;
    process.env.HOME = homeDir;
    process.env.SAC_API_KEY = 'env-key';

    try {
      await authLoginCommand.execute(
        makeConfig(server.url),
        makeFlags({ apiKey: 'login-key' }),
      );

      const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as { api_key?: string };
      assert.strictEqual(saved.api_key, 'login-key');
    } finally {
      if (originalEnvKey === undefined) delete process.env.SAC_API_KEY;
      else process.env.SAC_API_KEY = originalEnvKey;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
