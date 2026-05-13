import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chatSetModelCommand from '../../../src/commands/chat/set-model.ts';
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

describe('chat set-model command', () => {
  it('returns JSON in quiet mode after saving', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sac-chat-set-model-'));
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
      await chatSetModelCommand.execute(
        makeConfig({ output: 'json', quiet: true }),
        { model: 'claude-sonnet-4-6' },
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as { default_chat_model: string };
    assert.strictEqual(parsed.default_chat_model, 'claude-sonnet-4-6');

    const saved = JSON.parse(readFileSync(join(homeDir, '.sac', 'config.json'), 'utf-8')) as { default_chat_model?: string };
    assert.strictEqual(saved.default_chat_model, 'claude-sonnet-4-6');
  });
});
