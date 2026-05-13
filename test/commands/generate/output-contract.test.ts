import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import generateImageCommand from '../../../src/commands/generate/image.ts';
import generateVideoCommand from '../../../src/commands/generate/video.ts';
import generateAudioCommand from '../../../src/commands/generate/audio.ts';
import generate3dCommand from '../../../src/commands/generate/3d.ts';
import generateTaskCommand from '../../../src/commands/generate/task.ts';
import type { Config } from '../../../src/config/schema.ts';
import { CLIError } from '../../../src/errors/base.ts';
import { ExitCode } from '../../../src/errors/codes.ts';
import { createMockServer, jsonResponse } from '../../helpers/mock-server.ts';

function makeConfig(baseUrl: string, overrides: Partial<Config> = {}): Config {
  return {
    apiKey: 'test-key',
    fileApiKey: undefined,
    configPath: '/tmp/test.json',
    multimodalBaseUrl: baseUrl,
    llmBaseUrl: baseUrl,
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

async function captureJson(run: () => Promise<void>) {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (msg: string) => { logs.push(msg); };
  try {
    await run();
  } finally {
    console.log = orig;
  }
  return JSON.parse(logs.join('')) as { task_id?: string; urls?: string[] };
}

async function createGenerationServer(outputUrl: string) {
  const server = await createMockServer({
    routes: {
      'POST /v1/generation': () => jsonResponse({ id: 'task-123', status: 'submitted' }),
      '/v1/generation/task/task-123': () => jsonResponse({
        id: 'task-123',
        status: 'completed',
        output: [
          {
            content: [{ url: outputUrl }],
          },
        ],
      }),
    },
  });
  after(() => server.close());
  return server;
}

describe('generate command output contract', () => {
  it('generate image keeps structured JSON in quiet mode', async () => {
    const server = await createGenerationServer('https://cdn.example.com/image.webp');
    const parsed = await captureJson(() =>
      generateImageCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'a cat in space', model: 'sdxl' }),
      ),
    );

    assert.strictEqual(parsed.task_id, 'task-123');
    assert.deepStrictEqual(parsed.urls, ['https://cdn.example.com/image.webp']);
  });

  it('generate video keeps structured JSON in quiet mode', async () => {
    const server = await createGenerationServer('https://cdn.example.com/video.mp4');
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'ocean waves', model: 'vidu_q3_pro' }),
      ),
    );

    assert.strictEqual(parsed.task_id, 'task-123');
    assert.deepStrictEqual(parsed.urls, ['https://cdn.example.com/video.mp4']);
  });

  it('generate audio keeps structured JSON in quiet mode', async () => {
    const server = await createGenerationServer('https://cdn.example.com/song.mp3');
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'upbeat pop', model: 'lyria_3_pro_preview' }),
      ),
    );

    assert.strictEqual(parsed.task_id, 'task-123');
    assert.deepStrictEqual(parsed.urls, ['https://cdn.example.com/song.mp3']);
  });

  it('generate 3d keeps structured JSON in quiet mode', async () => {
    const server = await createGenerationServer('https://cdn.example.com/model.glb');
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
        }),
      ),
    );

    assert.strictEqual(parsed.task_id, 'task-123');
    assert.deepStrictEqual(parsed.urls, ['https://cdn.example.com/model.glb']);
  });

  it('rejects --output-only-url with --output json', async () => {
    await assert.rejects(
      () => generateTaskCommand.execute(
        makeConfig('https://api.example.com', { output: 'json' }),
        makeFlags({ _positional: ['task-123'], outputOnlyUrl: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('--output-only-url'));
        return true;
      },
    );
  });
});
