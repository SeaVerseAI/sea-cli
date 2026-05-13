import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import modelSearchCommand from '../../../src/commands/model/search.ts';
import type { Config } from '../../../src/config/schema.ts';
import { CLIError } from '../../../src/errors/base.ts';
import { ExitCode } from '../../../src/errors/codes.ts';

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-api-key',
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

const originalFetch = globalThis.fetch;
const originalLog = console.log;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
});

describe('model search command', () => {
  it('returns structured JSON and encodes repeatable filters in the query string', async () => {
    const logs: string[] = [];
    let requestedUrl = '';
    let requestedHeaders: Record<string, string> = {};

    console.log = (msg: string) => { logs.push(msg); };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedHeaders = init?.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          estimatedTotalHits: 1,
          hits: [
            {
              id: 'kling_v3_i2v',
              name: 'kling_v3_i2v',
              provider: 'kling',
              description: 'Kling image to video',
              input: ['image', 'text'],
              output: ['video'],
              media_type: 'video',
              tags: ['image-to-video'],
              tags_abbr: ['i2v'],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    await modelSearchCommand.execute(
      makeConfig({ output: 'json', quiet: true }),
      makeFlags({
        query: 'kling',
        inputModality: ['image'],
        outputModality: ['video'],
        type: ['i2v'],
        provider: ['kling', 'alibaba'],
        limit: 5,
      }),
    );

    const parsed = JSON.parse(logs.join('')) as { estimatedTotalHits: number; hits: Array<{ name: string }> };
    assert.strictEqual(parsed.estimatedTotalHits, 1);
    assert.deepStrictEqual(parsed.hits.map((item) => item.name), ['kling_v3_i2v']);

    const url = new URL(requestedUrl);
    assert.strictEqual(url.origin, 'https://api.example.com');
    assert.strictEqual(url.pathname, '/v1/models/skill/search');
    assert.strictEqual(url.searchParams.get('q'), 'kling');
    assert.deepStrictEqual(url.searchParams.getAll('input'), ['image']);
    assert.deepStrictEqual(url.searchParams.getAll('output'), ['video']);
    assert.deepStrictEqual(url.searchParams.getAll('type'), ['i2v']);
    assert.deepStrictEqual(url.searchParams.getAll('provider'), ['kling', 'alibaba']);
    assert.strictEqual(url.searchParams.get('limit'), '5');
    assert.strictEqual(requestedHeaders.Authorization, 'Bearer test-api-key');
    assert.strictEqual(requestedHeaders['User-Agent']?.startsWith('sac-cli/'), true);
  });

  it('prints readable text rows and summary in text mode', async () => {
    const logs: string[] = [];

    console.log = (msg: string) => { logs.push(msg); };
    globalThis.fetch = (async () => new Response(
      JSON.stringify({
        estimatedTotalHits: 2,
        hits: [
          {
            id: 'kling_v3_i2v',
            name: 'kling_v3_i2v',
            provider: 'kling',
            description: 'Kling image to video',
            input: ['image', 'text'],
            output: ['video'],
            media_type: 'video',
            tags: ['image-to-video'],
            tags_abbr: ['i2v'],
          },
          {
            id: 'tencent_mps_super_resolution',
            name: 'tencent_mps_super_resolution',
            provider: 'tencent',
            description: 'Video super resolution',
            input: ['video'],
            output: ['video'],
            media_type: 'video',
            tags: ['video-super-resolution'],
            tags_abbr: ['vsr'],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

    await modelSearchCommand.execute(
      makeConfig({ output: 'text', quiet: true }),
      makeFlags(),
    );

    const output = logs.join('\n');
    assert.match(output, /kling_v3_i2v/);
    assert.match(output, /\[i2v\]/);
    assert.match(output, /image\+text→video/);
    assert.match(output, /2 model\(s\) found\./);
  });

  it('prints a friendly no-result message for empty text searches', async () => {
    const logs: string[] = [];

    console.log = (msg: string) => { logs.push(msg); };
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ estimatedTotalHits: 0, hits: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

    await modelSearchCommand.execute(
      makeConfig({ output: 'text', quiet: true }),
      makeFlags({ query: 'missing-model' }),
    );

    assert.strictEqual(logs.join(''), 'No models matching "missing-model".');
  });

  it('fails with a network error when the gateway is unreachable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;

    await assert.rejects(
      () => modelSearchCommand.execute(makeConfig(), makeFlags()),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.NETWORK);
        assert.match(err.message, /Cannot reach gateway/);
        return true;
      },
    );
  });

  it('maps authentication failures through the shared HTTP client', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: { message: 'missing authentication token' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

    await assert.rejects(
      () => modelSearchCommand.execute(makeConfig(), makeFlags()),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.AUTH);
        assert.match(err.message, /Authentication failed/);
        assert.match(err.message, /HTTP 401/);
        return true;
      },
    );
  });
});
