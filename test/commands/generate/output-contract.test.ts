import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import generateImageCommand from '../../../src/commands/generate/image.ts';
import generateVideoCommand from '../../../src/commands/generate/video.ts';
import generateAudioCommand from '../../../src/commands/generate/audio.ts';
import generate3dCommand from '../../../src/commands/generate/3d.ts';
import generateTaskCommand from '../../../src/commands/generate/task.ts';
import generateSubmitCommand from '../../../src/commands/generate/submit.ts';
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

async function captureText(run: () => Promise<void>) {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (msg: string) => { logs.push(msg); };
  try {
    await run();
  } finally {
    console.log = orig;
  }
  return logs.join('\n');
}

async function createGenerationServer(outputUrl: string) {
  const scanRequests: unknown[] = [];
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
      'POST /v1/image/scan': (_req, body) => {
        scanRequests.push(JSON.parse(body));
        return jsonResponse({ decision: 'pass', usage: { cost: '1' } });
      },
    },
  });
  after(() => server.close());
  return { server, scanRequests };
}

async function createGenerationServerWithoutOutputUrls() {
  const server = await createMockServer({
    routes: {
      'POST /v1/generation': () => jsonResponse({ id: 'task-123', status: 'submitted' }),
      '/v1/generation/task/task-123': () => jsonResponse({
        id: 'task-123',
        status: 'completed',
        output: [
          {
            content: [{ type: 'text' }],
          },
        ],
      }),
    },
  });
  after(() => server.close());
  return server;
}

async function createGenerationServerWithFailingScan(outputUrl: string) {
  const scanRequests: unknown[] = [];
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
      'POST /v1/image/scan': (_req, body) => {
        scanRequests.push(JSON.parse(body));
        return jsonResponse({ message: 'scanner unavailable' }, 500);
      },
    },
  });
  after(() => server.close());
  return { server, scanRequests };
}

describe('generate command output contract', () => {
  it('generate image keeps structured JSON in quiet mode', async () => {
    const { server } = await createGenerationServer('https://cdn.example.com/image.webp');
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
    const { server } = await createGenerationServer('https://cdn.example.com/video.mp4');
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
    const { server } = await createGenerationServer('https://cdn.example.com/song.mp3');
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
    const { server } = await createGenerationServer('https://cdn.example.com/model.glb');
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

  it('generate image can scan generated output URLs for content safety', async () => {
    const { server, scanRequests } = await createGenerationServer('https://cdn.example.com/image.webp');
    const parsed = await captureJson(() =>
      generateImageCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'a cat in space', model: 'sdxl', contentSafety: true }),
      ),
    ) as { safety?: Array<{ url: string; status: string; is_video: boolean; result: { decision: string } }> };

    assert.deepStrictEqual(scanRequests, [
      {
        uri: 'https://cdn.example.com/image.webp',
        is_video: 0,
      },
    ]);
    assert.strictEqual(parsed.safety?.[0]?.url, 'https://cdn.example.com/image.webp');
    assert.strictEqual(parsed.safety?.[0]?.status, 'completed');
    assert.strictEqual(parsed.safety?.[0]?.is_video, false);
    assert.strictEqual(parsed.safety?.[0]?.result.decision, 'pass');
  });

  it('generate video scans output URLs in video mode', async () => {
    const { server, scanRequests } = await createGenerationServer('https://cdn.example.com/video.mp4');
    await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'ocean waves', model: 'vidu_q3_pro', duration: 5, contentSafety: true }),
      ),
    );

    assert.deepStrictEqual(scanRequests, [
      {
        uri: 'https://cdn.example.com/video.mp4',
        is_video: 1,
        duration: 5,
      },
    ]);
  });

  it('generate image still prints URLs when content safety scan fails', async () => {
    const { server, scanRequests } = await createGenerationServerWithFailingScan('https://cdn.example.com/image.webp');
    const parsed = await captureJson(() =>
      generateImageCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'a cat in space', model: 'sdxl', contentSafety: true }),
      ),
    ) as {
      task_id?: string;
      urls?: string[];
      safety?: Array<{ url: string; status: string; error?: string }>;
    };

    assert.strictEqual(parsed.task_id, 'task-123');
    assert.deepStrictEqual(parsed.urls, ['https://cdn.example.com/image.webp']);
    assert.deepStrictEqual(scanRequests, [
      {
        uri: 'https://cdn.example.com/image.webp',
        is_video: 0,
      },
    ]);
    assert.strictEqual(parsed.safety?.[0]?.status, 'failed');
    assert.strictEqual(parsed.safety?.[0]?.url, 'https://cdn.example.com/image.webp');
    assert.ok(parsed.safety?.[0]?.error);
  });

  it('generate task still prints task result when content safety scan fails', async () => {
    const { server } = await createGenerationServerWithFailingScan('https://cdn.example.com/image.webp');
    const parsed = await captureJson(() =>
      generateTaskCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ _positional: ['task-123'], contentSafety: true }),
      ),
    ) as {
      id?: string;
      output?: Array<{ content?: Array<{ url?: string }> }>;
      safety?: Array<{ status: string }>;
    };

    assert.strictEqual(parsed.id, 'task-123');
    assert.strictEqual(parsed.output?.[0]?.content?.[0]?.url, 'https://cdn.example.com/image.webp');
    assert.strictEqual(parsed.safety?.[0]?.status, 'failed');
  });

  it('generate image includes empty safety array when content safety is requested and no URLs exist', async () => {
    const server = await createGenerationServerWithoutOutputUrls();
    const parsed = await captureJson(() =>
      generateImageCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ prompt: 'a cat in space', model: 'sdxl', contentSafety: true }),
      ),
    ) as { status?: string; safety?: unknown[] };

    assert.strictEqual(parsed.status, 'completed');
    assert.deepStrictEqual(parsed.safety, []);
  });

  it('generate task does not call scanner for known unsupported output media', async () => {
    let scanCalled = false;
    const server = await createMockServer({
      routes: {
        '/v1/generation/task/task-123': () => jsonResponse({
          id: 'task-123',
          status: 'completed',
          output: [
            {
              content: [{ url: 'https://cdn.example.com/song.mp3' }],
            },
          ],
        }),
        'POST /v1/image/scan': () => {
          scanCalled = true;
          return jsonResponse({ decision: 'pass' });
        },
      },
    });
    after(() => server.close());

    const parsed = await captureJson(() =>
      generateTaskCommand.execute(
        makeConfig(server.url, { output: 'json', quiet: true }),
        makeFlags({ _positional: ['task-123'], contentSafety: true }),
      ),
    ) as {
      id?: string;
      output?: Array<{ content?: Array<{ url?: string }> }>;
      safety?: Array<{ url: string; status: string; error?: string }>;
    };

    assert.strictEqual(scanCalled, false);
    assert.strictEqual(parsed.id, 'task-123');
    assert.strictEqual(parsed.output?.[0]?.content?.[0]?.url, 'https://cdn.example.com/song.mp3');
    assert.strictEqual(parsed.safety?.[0]?.url, 'https://cdn.example.com/song.mp3');
    assert.strictEqual(parsed.safety?.[0]?.status, 'failed');
    assert.match(parsed.safety?.[0]?.error ?? '', /Unsupported content safety media type/);
  });

  it('generate submit keeps structured text output in quiet mode', async () => {
    const { server } = await createGenerationServer('https://cdn.example.com/image.webp');
    const text = await captureText(() =>
      generateSubmitCommand.execute(
        makeConfig(server.url, { output: 'text', quiet: true }),
        makeFlags({
          bodyJson: '{"model":"comfyuifast","input":[{"params":{"prompt":"1 girl"}}]}',
        }),
      ),
    );

    assert.ok(text.includes('task_id: task-123'));
    assert.ok(text.includes('urls:'));
    assert.ok(text.includes('https://cdn.example.com/image.webp'));
  });

  it('rejects --content-safety with --async', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig('https://api.example.com', { output: 'json', quiet: true }),
        makeFlags({ prompt: 'a cat in space', model: 'sdxl', async: true, contentSafety: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('--content-safety'));
        return true;
      },
    );
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

  it('rejects --content-safety for audio generation', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig('https://api.example.com', { output: 'json', quiet: true }),
        makeFlags({ prompt: 'upbeat pop', model: 'lyria_3_pro_preview', contentSafety: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('generate audio'));
        return true;
      },
    );
  });

  it('rejects --content-safety for 3d generation', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig('https://api.example.com', { output: 'json', quiet: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          contentSafety: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof CLIError);
        assert.strictEqual(err.exitCode, ExitCode.USAGE);
        assert.ok(err.message.includes('generate 3d'));
        return true;
      },
    );
  });
});
