import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import updateCommand from '../../../src/commands/update/index.ts';
import type { Config } from '../../../src/config/schema.ts';
import { CLIError } from '../../../src/errors/base.ts';
import { ExitCode } from '../../../src/errors/codes.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-key',
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

describe('update command', () => {
  it('rejects --output json', async () => {
    await assert.rejects(
      () => updateCommand.execute(makeConfig({ output: 'json' }), { output: 'json' }),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('--output json'));
        return true;
      },
    );
  });

  it('allows auto-json non-TTY output to fall back to text instructions', async () => {
    const originalWrite = process.stdout.write;
    let stdout = '';

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      await updateCommand.execute(makeConfig({ output: 'json', quiet: false }), {});
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.match(stdout, /npm install -g sac-cli@latest/);
  });

  it('prints npm and source update instructions', async () => {
    const originalWrite = process.stdout.write;
    let stdout = '';

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    try {
      await updateCommand.execute(makeConfig({ output: 'text', quiet: false }), {});
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.match(stdout, /npm install -g sac-cli@latest/);
    assert.match(stdout, /git pull && npm install && npm run build/);
  });
});
