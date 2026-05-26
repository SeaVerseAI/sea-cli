import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import contentSafetyCommand, { inferIsVideo } from '../../../src/commands/content/safety.ts';
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

describe('content-safety command', () => {
  it('infers common video URLs', () => {
    assert.strictEqual(inferIsVideo('https://cdn.example.com/a.mp4?x=1'), true);
    assert.strictEqual(inferIsVideo('https://cdn.example.com/a.webp'), false);
  });

  it('posts image scan request and prints structured JSON', async () => {
    const logs: string[] = [];
    let requestedUrl = '';
    let requestedBody: unknown;

    console.log = (msg: string) => { logs.push(msg); };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({ decision: 'pass', usage: { cost: '1' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    await contentSafetyCommand.execute(
      makeConfig({ output: 'json', quiet: true }),
      makeFlags({
        url: 'https://cdn.example.com/image.webp',
        riskType: ['porn'],
        detectedAge: 18,
      }),
    );

    assert.strictEqual(requestedUrl, 'https://api.example.com/v1/image/scan');
    assert.deepStrictEqual(requestedBody, {
      uri: 'https://cdn.example.com/image.webp',
      is_video: 0,
      risk_types: ['porn'],
      detected_age: 18,
    });

    const parsed = JSON.parse(logs.join('')) as { url: string; is_video: boolean; result: { decision: string } };
    assert.strictEqual(parsed.url, 'https://cdn.example.com/image.webp');
    assert.strictEqual(parsed.is_video, false);
    assert.strictEqual(parsed.result.decision, 'pass');
  });

  it('dry-run prints the scan request without calling the API', async () => {
    const logs: string[] = [];
    let called = false;

    console.log = (msg: string) => { logs.push(msg); };
    globalThis.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    await contentSafetyCommand.execute(
      makeConfig({ output: 'json', quiet: true, dryRun: true }),
      makeFlags({
        url: 'https://cdn.example.com/video.mp4',
        video: true,
        duration: 8,
        dryRun: true,
      }),
    );

    assert.strictEqual(called, false);
    assert.deepStrictEqual(JSON.parse(logs.join('')), {
      request: {
        uri: 'https://cdn.example.com/video.mp4',
        is_video: 1,
        duration: 8,
      },
    });
  });

  it('forwards direct scan failures to the caller', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ message: 'scanner unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )) as typeof fetch;

    await assert.rejects(
      () => contentSafetyCommand.execute(
        makeConfig({ output: 'json', quiet: true, timeout: 1 }),
        makeFlags({ url: 'https://cdn.example.com/image.webp' }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.NETWORK);
        return true;
      },
    );
  });

  it('rejects conflicting media mode flags', async () => {
    await assert.rejects(
      () => contentSafetyCommand.execute(
        makeConfig(),
        makeFlags({ url: 'https://cdn.example.com/a.mp4', video: true, image: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('--video'));
        return true;
      },
    );
  });
});
