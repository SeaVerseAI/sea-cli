import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import configShowCommand from '../../../src/commands/config/show.ts';
import type { Config } from '../../../src/config/schema.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: undefined,
    fileApiKey: undefined,
    configPath: '/tmp/test.json',
    baseUrl: undefined,
    baseUrlSource: 'none',
    multimodalBaseUrl: '',
    llmBaseUrl: '',
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

describe('config show command', () => {
  it('emits base_url instead of derived internal gateway endpoints', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await configShowCommand.execute(
        makeConfig({
          baseUrl: 'https://gateway.example.com',
          baseUrlSource: 'config',
          multimodalBaseUrl: 'https://gateway.example.com/model',
          llmBaseUrl: 'https://gateway.example.com/llm',
        }),
        { quiet: true, verbose: false, noColor: true, yes: false, dryRun: false, help: false, nonInteractive: true, async: false },
      );
    } finally {
      console.log = orig;
    }

    const parsed = JSON.parse(logs.join('')) as Record<string, unknown>;
    assert.strictEqual(parsed.base_url, 'https://gateway.example.com');
    assert.strictEqual('multimodal_base_url' in parsed, false);
    assert.strictEqual('llm_base_url' in parsed, false);
  });
});
