import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { maybeResolveApiKey, resolveApiKey } from '../../src/auth/resolver.ts';
import type { Config } from '../../src/config/schema.ts';
import { CLIError } from '../../src/errors/base.ts';
import { ExitCode } from '../../src/errors/codes.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: undefined,
    fileApiKey: undefined,
    configPath: '/tmp/test-config.json',
    multimodalBaseUrl: 'https://api.example.com',
    llmBaseUrl: 'https://api.example.com',
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

describe('API key resolver', () => {
  it('prefers --api-key over env and config', () => {
    const originalEnv = process.env.SAC_API_KEY;
    process.env.SAC_API_KEY = 'env-key';
    try {
      const resolved = resolveApiKey(makeConfig({
        apiKey: 'flag-key',
        fileApiKey: 'config-key',
      }));
      assert.strictEqual(resolved.token, 'flag-key');
      assert.strictEqual(resolved.source, 'flag');
    } finally {
      if (originalEnv === undefined) delete process.env.SAC_API_KEY;
      else process.env.SAC_API_KEY = originalEnv;
    }
  });

  it('uses SAC_API_KEY when no flag is present', () => {
    const originalEnv = process.env.SAC_API_KEY;
    process.env.SAC_API_KEY = 'env-key';
    try {
      const resolved = resolveApiKey(makeConfig({ fileApiKey: 'config-key' }));
      assert.strictEqual(resolved.token, 'env-key');
      assert.strictEqual(resolved.source, 'env');
    } finally {
      if (originalEnv === undefined) delete process.env.SAC_API_KEY;
      else process.env.SAC_API_KEY = originalEnv;
    }
  });

  it('falls back to config file key', () => {
    const resolved = resolveApiKey(makeConfig({ fileApiKey: 'config-key' }));
    assert.strictEqual(resolved.token, 'config-key');
    assert.strictEqual(resolved.source, 'config');
  });

  it('returns null from maybeResolveApiKey when no key is present', () => {
    assert.strictEqual(maybeResolveApiKey(makeConfig()), null);
  });

  it('throws AUTH error when no key is available', () => {
    assert.throws(
      () => resolveApiKey(makeConfig()),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.AUTH);
        return true;
      },
    );
  });
});
