import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { deriveBaseUrls, loadConfig, normalizeBaseUrl } from '../../src/config/loader.ts';
import type { GlobalFlags } from '../../src/types/flags.ts';

function makeFlags(overrides: Partial<GlobalFlags> = {}): GlobalFlags {
  return {
    quiet: false,
    verbose: false,
    noColor: false,
    yes: false,
    dryRun: false,
    help: false,
    nonInteractive: false,
    async: false,
    ...overrides,
  };
}

describe('deriveBaseUrls', () => {
  it('normalizes model and llm endpoints back to the gateway root', () => {
    assert.strictEqual(normalizeBaseUrl('https://gateway.example.com/model'), 'https://gateway.example.com');
    assert.strictEqual(normalizeBaseUrl('https://gateway.example.com/llm/'), 'https://gateway.example.com');
  });

  it('expands a gateway root into model and llm endpoints', () => {
    assert.deepStrictEqual(
      deriveBaseUrls('https://gateway.example.com'),
      {
        multimodalBaseUrl: 'https://gateway.example.com/model',
        llmBaseUrl: 'https://gateway.example.com/llm',
      },
    );
  });

  it('keeps a /model base and derives the sibling /llm endpoint', () => {
    assert.deepStrictEqual(
      deriveBaseUrls('https://gateway.example.com/model'),
      {
        multimodalBaseUrl: 'https://gateway.example.com/model',
        llmBaseUrl: 'https://gateway.example.com/llm',
      },
    );
  });

  it('keeps a /llm base and derives the sibling /model endpoint', () => {
    assert.deepStrictEqual(
      deriveBaseUrls('https://gateway.example.com/llm/'),
      {
        multimodalBaseUrl: 'https://gateway.example.com/model',
        llmBaseUrl: 'https://gateway.example.com/llm',
      },
    );
  });
});

describe('loadConfig temporary overrides', () => {
  it('--api-key remains a command-only override on the effective config', () => {
    const config = loadConfig(makeFlags({ apiKey: 'flag-key' }));
    assert.strictEqual(config.apiKey, 'flag-key');
  });

  it('--base-url overrides both effective gateway base URLs for the current command only', () => {
    const originalBaseUrl = process.env.SAC_BASE_URL;
    process.env.SAC_BASE_URL = 'https://env.example.com';

    try {
      const config = loadConfig(makeFlags({ baseUrl: 'https://flag.example.com' }));
      assert.strictEqual(config.baseUrl, 'https://flag.example.com');
      assert.strictEqual(config.baseUrlSource, 'flag');
      assert.strictEqual(config.multimodalBaseUrl, 'https://flag.example.com/model');
      assert.strictEqual(config.llmBaseUrl, 'https://flag.example.com/llm');
    } finally {
      if (originalBaseUrl === undefined) delete process.env.SAC_BASE_URL;
      else process.env.SAC_BASE_URL = originalBaseUrl;
    }
  });

  it('--base-url accepts an explicit /model endpoint and derives /llm from it', () => {
    const config = loadConfig(makeFlags({ baseUrl: 'https://flag.example.com/model' }));
    assert.strictEqual(config.baseUrl, 'https://flag.example.com');
    assert.strictEqual(config.multimodalBaseUrl, 'https://flag.example.com/model');
    assert.strictEqual(config.llmBaseUrl, 'https://flag.example.com/llm');
  });

  it('temporary --api-key and --base-url overrides do not rewrite the persisted config file', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sac-loader-config-'));
    const sacDir = join(homeDir, '.sac');
    const configPath = join(sacDir, 'config.json');
    const originalHome = process.env.HOME;

    mkdirSync(sacDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      api_key: 'saved-key',
      base_url: 'https://saved.example.com',
    }, null, 2));
    process.env.HOME = homeDir;

    try {
      const config = loadConfig(makeFlags({
        apiKey: 'temp-key',
        baseUrl: 'https://temp.example.com',
      }));

      assert.strictEqual(config.apiKey, 'temp-key');
      assert.strictEqual(config.baseUrl, 'https://temp.example.com');
      assert.strictEqual(config.multimodalBaseUrl, 'https://temp.example.com/model');
      assert.strictEqual(config.llmBaseUrl, 'https://temp.example.com/llm');

      const persisted = JSON.parse(readFileSync(configPath, 'utf8')) as {
        api_key: string;
        base_url: string;
      };
      assert.deepStrictEqual(persisted, {
        api_key: 'saved-key',
        base_url: 'https://saved.example.com',
      });
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  it('loads legacy multimodal_base_url as base_url compatibility input', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'sac-loader-legacy-config-'));
    const sacDir = join(homeDir, '.sac');
    const originalHome = process.env.HOME;
    const originalBaseUrl = process.env.SAC_BASE_URL;

    mkdirSync(sacDir, { recursive: true });
    writeFileSync(join(sacDir, 'config.json'), JSON.stringify({
      multimodal_base_url: 'https://legacy.example.com/model',
    }, null, 2));
    process.env.HOME = homeDir;
    delete process.env.SAC_BASE_URL;

    try {
      const config = loadConfig(makeFlags());
      assert.strictEqual(config.baseUrl, 'https://legacy.example.com');
      assert.strictEqual(config.baseUrlSource, 'config');
      assert.strictEqual(config.multimodalBaseUrl, 'https://legacy.example.com/model');
      assert.strictEqual(config.llmBaseUrl, 'https://legacy.example.com/llm');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalBaseUrl === undefined) delete process.env.SAC_BASE_URL;
      else process.env.SAC_BASE_URL = originalBaseUrl;
    }
  });
});
