import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import configSetCommand from '../../../src/commands/config/set.ts';
import type { Config } from '../../../src/config/schema.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: undefined,
    fileApiKey: undefined,
    configPath: '/tmp/test.json',
    multimodalBaseUrl: 'https://api.example.com',
    llmBaseUrl: 'https://api.example.com',
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

describe('config set command', () => {
  it('returns JSON in quiet mode after saving', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sac-config-set-'));
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;
    after(() => {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    });

    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await configSetCommand.execute(
        makeConfig({ output: 'json', quiet: true }),
        { key: 'timeout', value: '600' },
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as { timeout: number };
    assert.strictEqual(parsed.timeout, 600);

    const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as { timeout?: number };
    assert.strictEqual(saved.timeout, 600);
  });

  it('normalizes base_url before saving and emitting JSON', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sac-config-set-base-'));
    const originalHome = process.env.HOME;
    process.env.HOME = homeDir;
    after(() => {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      rmSync(homeDir, { recursive: true, force: true });
    });

    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await configSetCommand.execute(
        makeConfig({ output: 'json', quiet: true }),
        { key: 'base_url', value: 'https://gateway.example.com/model' },
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as { base_url: string };
    assert.strictEqual(parsed.base_url, 'https://gateway.example.com');

    const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as { base_url?: string };
    assert.strictEqual(saved.base_url, 'https://gateway.example.com');
  });

  it('normalizes base_url consistently in dry-run output', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await configSetCommand.execute(
        makeConfig({ dryRun: true, output: 'json', quiet: true }),
        { key: 'base_url', value: 'https://gateway.example.com/llm' },
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as { would_set: { base_url: string } };
    assert.strictEqual(parsed.would_set.base_url, 'https://gateway.example.com');
  });
});
