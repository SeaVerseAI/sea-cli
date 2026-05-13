import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import authLogoutCommand from '../../../src/commands/auth/logout.ts';
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

describe('auth logout command', () => {
  it('returns JSON in dry-run mode', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await authLogoutCommand.execute(makeConfig({ dryRun: true }), {});
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.would_remove, true);
    assert.strictEqual(parsed.removed, false);
  });
});
