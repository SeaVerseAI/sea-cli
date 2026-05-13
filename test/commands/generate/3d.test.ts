import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import generate3dCommand from '../../../src/commands/generate/3d.ts';
import {
  DEFAULT_3D_IMAGE_MODEL,
  DEFAULT_3D_MULTIVIEW_MODEL,
  DEFAULT_3D_TEXT_MODEL,
} from '../../../src/commands/generate/3d.ts';
import type { Config } from '../../../src/config/schema.ts';
import { createMockServer, jsonResponse } from '../../helpers/mock-server.ts';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  return JSON.parse(logs.join('')) as { request: Record<string, unknown> };
}

async function captureAnyJson(run: () => Promise<void>) {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (msg: string) => { logs.push(msg); };
  try {
    await run();
  } finally {
    console.log = orig;
  }
  return JSON.parse(logs.join('')) as Record<string, unknown>;
}

describe('generate 3d command', () => {
  it('uses the built-in text-to-3d model when only prompt is provided', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'a stylized toy robot',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, DEFAULT_3D_TEXT_MODEL);
  });

  it('uses the built-in image-to-3d model when only image-url is provided', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          imageUrl: 'https://example.com/object.png',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, DEFAULT_3D_IMAGE_MODEL);
  });

  it('uses the built-in multiview 3d model when only image-urls are provided', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          imageUrls: [
            'https://example.com/front.png',
            'https://example.com/left.png',
            'https://example.com/back.png',
            'https://example.com/right.png',
          ],
          texture: 0,
          pbr: 0,
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, DEFAULT_3D_MULTIVIEW_MODEL);
  });

  it('still requires --model for ambiguous 3d inputs', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('model'));
        return true;
      },
    );
  });

  it('throws on invalid model name', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'not-a-real-3d-model',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('not-a-real-3d-model'));
        assert.ok(err.message.includes('sac model search --query not-a-real-3d-model'));
        assert.ok(err.message.includes('sac model get <model-id>'));
        assert.ok(err.message.includes('sac generate submit --body-json'));
        return true;
      },
    );
  });

  it('rejects using a non-3d model under generate 3d', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'sdxl',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Use `sac generate image` instead.'));
        return true;
      },
    );
  });

  it('requires prompt for volces_seed3d', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'volces_seed3d', imageUrl: 'https://example.com/cat.png', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('prompt'));
        return true;
      },
    );
  });

  it('requires --image-url for volces_seed3d', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'volces_seed3d', prompt: 'a toy robot', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--image-url'));
        return true;
      },
    );
  });

  it('supports volces_seed3d dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a stylized ceramic cat figurine',
          imageUrl: 'https://example.com/cat.png',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'volces_seed3d');
    assert.deepStrictEqual(parsed.request.input[0].params.content, [
      { type: 'text', text: 'a stylized ceramic cat figurine' },
      { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
    ]);
  });

  it('supports tencent_hunyuan_3d prompt dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d',
          prompt: 'a carved jade dragon',
          resultFormat: 'GLB',
          enablePbr: true,
          multiViewImages: [
            'left=https://example.com/left.png',
            'right=base64:ZmFrZS1pbWFnZS1kYXRh',
          ],
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'tencent_hunyuan_3d');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      prompt: 'a carved jade dragon',
      result_format: 'GLB',
      enable_pbr: true,
      multi_view_images: [
        { View: 'left', ImageUrl: 'https://example.com/left.png' },
        { View: 'right', ImageBase64: 'ZmFrZS1pbWFnZS1kYXRh' },
      ],
    });
  });

  it('supports tencent_hunyuan_3d_pro image dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d_pro',
          imageUrl: 'https://example.com/object.png',
          faceCount: 80000,
          generateType: 'LowPoly',
          polygonType: 'triangle',
          enablePbr: true,
          multiViewImages: [
            'https://example.com/view-1.png',
            'https://example.com/view-2.png',
          ],
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'tencent_hunyuan_3d_pro');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      image_url: 'https://example.com/object.png',
      face_count: 80000,
      generate_type: 'LowPoly',
      polygon_type: 'triangle',
      enable_pbr: true,
      multi_view_images: [
        'https://example.com/view-1.png',
        'https://example.com/view-2.png',
      ],
    });
  });

  it('supports tencent_hunyuan_3d_rapid image-base64 dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d_rapid',
          imageBase64: 'ZmFrZS1iYXNlNjQ=',
          resultFormat: 'FBX',
          enablePbr: true,
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'tencent_hunyuan_3d_rapid');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      image_base64: 'ZmFrZS1iYXNlNjQ=',
      result_format: 'FBX',
      enable_pbr: true,
    });
  });

  it('supports tripo3d_text_to_model dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tripo3d_text_to_model',
          prompt: 'a stylized toy robot',
          modelVersion: 'v3.0-20250812',
          modelSeed: 42,
          faceLimit: 4000,
          texture: 1,
          pbr: 1,
          textureSeed: 7,
          textureAlignment: 'geometry',
          textureQuality: 'detailed',
          autoSize: 1,
          style: 'low_poly',
          orientation: 'front',
          quad: 0,
          compress: 'meshopt',
          smartLowPoly: 1,
          generateParts: 0,
          geometryQuality: 'detailed',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'tripo3d_text_to_model');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      model_version: 'v3.0-20250812',
      model_seed: 42,
      texture: true,
      pbr: true,
      quad: false,
      smart_low_poly: true,
      face_limit: 4000,
      texture_seed: 7,
      texture_alignment: 'geometry',
      texture_quality: 'detailed',
      auto_size: true,
      style: 'low_poly',
      orientation: 'front',
      geometry_quality: 'detailed',
      compress: 'meshopt',
      generate_parts: false,
      prompt: 'a stylized toy robot',
    });
  });

  it('supports tripo3d_image_to_model dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tripo3d_image_to_model',
          imageUrl: 'https://example.com/object.png',
          modelVersion: 'Turbo-v1.0-20250506',
          texture: 1,
          pbr: 1,
          style: 'realistic',
          orientation: 'front',
          geometryQuality: 'standard',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'tripo3d_image_to_model');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      model_version: 'Turbo-v1.0-20250506',
      texture: true,
      pbr: true,
      style: 'realistic',
      orientation: 'front',
      geometry_quality: 'standard',
      file: { url: 'https://example.com/object.png' },
    });
  });

  it('supports tripo3d_multiview_to_model dry-run', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tripo3d_multiview_to_model',
          imageUrls: [
            'https://example.com/front.png',
            'https://example.com/left.png',
            'https://example.com/back.png',
            'https://example.com/right.png',
          ],
          modelVersion: 'v2.5-20250123',
          texture: 0,
          pbr: 0,
          quad: 0,
          generateParts: 1,
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'tripo3d_multiview_to_model');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      model_version: 'v2.5-20250123',
      texture: false,
      pbr: false,
      quad: false,
      generate_parts: true,
      files: [
        { type: 'image', url: 'https://example.com/front.png' },
        { type: 'image', url: 'https://example.com/left.png' },
        { type: 'image', url: 'https://example.com/back.png' },
        { type: 'image', url: 'https://example.com/right.png' },
      ],
    });
  });

  it('requires exactly one primary input for tencent_hunyuan_3d', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d',
          prompt: 'a dragon',
          imageUrl: 'https://example.com/object.png',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('exactly one'));
        return true;
      },
    );
  });

  it('rejects generate-parts without explicitly disabling texture and pbr for tripo3d_multiview_to_model', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tripo3d_multiview_to_model',
          imageUrls: [
            'https://example.com/front.png',
            'https://example.com/left.png',
            'https://example.com/back.png',
            'https://example.com/right.png',
          ],
          generateParts: 1,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--texture 0'));
        return true;
      },
    );
  });

  it('rejects wrong image count for tripo3d_multiview_to_model', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tripo3d_multiview_to_model',
          imageUrls: [
            'https://example.com/front.png',
            'https://example.com/left.png',
            'https://example.com/back.png',
          ],
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('exactly 4 --image-urls'));
        return true;
      },
    );
  });

  it('rejects tripo-only flags on volces_seed3d', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          modelVersion: 'v2.5-20250123',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--model-version'));
        return true;
      },
    );
  });

  it('rejects tripo-only flags on tencent_hunyuan_3d', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d',
          prompt: 'a dragon',
          texture: 1,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--texture'));
        return true;
      },
    );
  });

  it('rejects unsupported tencent_hunyuan_3d_pro result-format flag', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d_pro',
          prompt: 'a dragon',
          resultFormat: 'GLB',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--result-format'));
        return true;
      },
    );
  });

  it('rejects unsupported tencent_hunyuan_3d_rapid multi-view flag', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d_rapid',
          prompt: 'a dragon',
          multiViewImages: ['left=https://example.com/left.png'],
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--multi-view-image'));
        return true;
      },
    );
  });

  it('rejects duplicate directions for tencent_hunyuan_3d multi-view input', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d',
          prompt: 'a dragon',
          multiViewImages: [
            'left=https://example.com/left-1.png',
            'left=https://example.com/left-2.png',
          ],
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('duplicate'));
        return true;
      },
    );
  });

  it('accepts raw base64 with equals padding for tencent_hunyuan_3d_pro multi-view input', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d_pro',
          prompt: 'a dragon',
          multiViewImages: ['ZmFrZS1iYXNlNjQ9PQ=='],
          dryRun: true,
        }),
      ),
    );

    assert.deepStrictEqual(parsed.request.input[0].params.multi_view_images, ['ZmFrZS1iYXNlNjQ9PQ==']);
  });

  it('rejects out-of-range face-count for tencent_hunyuan_3d_pro', async () => {
    await assert.rejects(
      () => generate3dCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_hunyuan_3d_pro',
          prompt: 'a dragon',
          faceCount: 10,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('40000'));
        return true;
      },
    );
  });

  it('returns task_id immediately in async mode without polling', async () => {
    const server = await createMockServer({
      routes: {
        'POST /v1/generation': () => jsonResponse({ id: 'task-3d-123', status: 'submitted' }),
      },
    });
    after(() => server.close());

    const parsed = await captureAnyJson(() =>
      generate3dCommand.execute(
        makeConfig({ multimodalBaseUrl: server.url, llmBaseUrl: server.url, output: 'json', quiet: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          async: true,
        }),
      ),
    );

    assert.strictEqual(parsed.task_id, 'task-3d-123');
    assert.strictEqual(parsed.status, 'submitted');
  });

  it('downloads generated 3d files with the detected extension', async () => {
    const server = await createMockServer({
      routes: {
        'POST /v1/generation': () => jsonResponse({ id: 'task-3d-123', status: 'submitted' }),
        '/v1/generation/task/task-3d-123': () => jsonResponse({
          id: 'task-3d-123',
          status: 'completed',
          output: [
            {
              content: [
                {
                  url: `${server.url}/assets/model.usdz?sig=test`,
                },
              ],
            },
          ],
        }),
        '/assets/model.usdz': () => jsonResponse({ ok: true }),
      },
    });
    after(() => server.close());

    const outDir = mkdtempSync(join(tmpdir(), 'sac-3d-'));
    const parsed = await captureAnyJson(() =>
      generate3dCommand.execute(
        makeConfig({ multimodalBaseUrl: server.url, llmBaseUrl: server.url, output: 'json', quiet: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          outDir,
          outPrefix: 'artifact',
        }),
      ),
    );

    assert.deepStrictEqual(parsed.saved, [join(outDir, 'artifact_001.usdz')]);
    assert.ok(existsSync(join(outDir, 'artifact_001.usdz')));
  });

  it('falls back to .glb when the result url has no extension', async () => {
    const server = await createMockServer({
      routes: {
        'POST /v1/generation': () => jsonResponse({ id: 'task-3d-456', status: 'submitted' }),
        '/v1/generation/task/task-3d-456': () => jsonResponse({
          id: 'task-3d-456',
          status: 'completed',
          output: [
            {
              content: [
                {
                  url: `${server.url}/assets/model-download`,
                },
              ],
            },
          ],
        }),
        '/assets/model-download': () => jsonResponse({ ok: true }),
      },
    });
    after(() => server.close());

    const outDir = mkdtempSync(join(tmpdir(), 'sac-3d-'));
    const parsed = await captureAnyJson(() =>
      generate3dCommand.execute(
        makeConfig({ multimodalBaseUrl: server.url, llmBaseUrl: server.url, output: 'json', quiet: true }),
        makeFlags({
          model: 'volces_seed3d',
          prompt: 'a toy robot',
          imageUrl: 'https://example.com/robot.png',
          outDir,
        }),
      ),
    );

    assert.deepStrictEqual(parsed.saved, [join(outDir, 'model_001.glb')]);
    assert.ok(existsSync(join(outDir, 'model_001.glb')));
  });
});
