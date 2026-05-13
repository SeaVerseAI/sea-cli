import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import generateImageCommand from '../../../src/commands/generate/image.ts';
import generateVideoCommand from '../../../src/commands/generate/video.ts';
import generateAudioCommand from '../../../src/commands/generate/audio.ts';
import generate3dCommand from '../../../src/commands/generate/3d.ts';
import type { Config } from '../../../src/config/schema.ts';

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
    listModels: true,
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
  return JSON.parse(logs.join('')) as { providers: Array<{ provider: string; models: string[] }> };
}

describe('generate model list output', () => {
  it('generate image emits a single JSON document', async () => {
    const parsed = await captureJson(() =>
      generateImageCommand.execute(makeConfig(), makeFlags()),
    );
    assert.ok(Array.isArray(parsed.providers));
    assert.ok(parsed.providers.length > 0);
    assert.ok(parsed.providers.every((entry) => typeof entry.provider === 'string'));
  });

  it('generate image list includes newly registered Kling image models', async () => {
    const parsed = await captureJson(() =>
      generateImageCommand.execute(makeConfig(), makeFlags({ provider: 'kling' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['kling']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('kling_v3_image'));
    assert.ok(models.includes('kling_omni_image'));
    assert.ok(models.includes('kling_v3_omni_image'));
  });

  it('generate image list includes Tencent image models', async () => {
    const parsed = await captureJson(() =>
      generateImageCommand.execute(makeConfig(), makeFlags({ provider: 'tencent' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['tencent']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('tencent_image_creation_3'));
  });

  it('generate image list includes Alibaba image models', async () => {
    const parsed = await captureJson(() =>
      generateImageCommand.execute(makeConfig(), makeFlags({ provider: 'alibaba' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['alibaba']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('alibaba_wan27_image'));
    assert.ok(models.includes('alibaba_wan27_image_pro'));
  });

  it('generate image list includes Tripo3D image models', async () => {
    const parsed = await captureJson(() =>
      generateImageCommand.execute(makeConfig(), makeFlags({ provider: 'tripo3d' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['tripo3d']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('tripo3d_text_to_image'));
  });

  it('generate video emits a single JSON document', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(makeConfig(), makeFlags()),
    );
    assert.ok(Array.isArray(parsed.providers));
    assert.ok(parsed.providers.length > 0);
    assert.ok(parsed.providers.every((entry) => Array.isArray(entry.models)));
  });

  it('generate video list includes newly registered Kling models', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(makeConfig(), makeFlags({ provider: 'kling' })),
    );

    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['kling']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('kling_avatar'));
    assert.ok(models.includes('kling_motion_control'));
    assert.ok(models.includes('kling_v3_motion_control'));
    assert.ok(models.includes('kling_effects_single'));
    assert.ok(models.includes('kling_effects_multi_v16'));
    assert.ok(models.includes('kling_duration_extension'));
    assert.ok(models.includes('kling_lipsync'));
    assert.ok(models.includes('kling_omni_video'));
    assert.ok(models.includes('kling_v3_omni_video'));
  });

  it('generate video list includes Tencent Kling models', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(makeConfig(), makeFlags({ provider: 'tencent' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['tencent']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('tencent_kling_v3'));
    assert.ok(models.includes('tencent_kling_v3_omni'));
    assert.ok(models.includes('tencent_mps_super_resolution'));
  });

  it('generate video list includes Alibaba video models', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(makeConfig(), makeFlags({ provider: 'alibaba' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['alibaba']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('alibaba_wan27_t2v'));
    assert.ok(models.includes('alibaba_wan27_i2v'));
    assert.ok(models.includes('alibaba_wan27_r2v'));
    assert.ok(models.includes('alibaba_wan27_videoedit'));
    assert.ok(models.includes('alibaba_wanx26_i2v_flash'));
  });

  it('generate video list includes PixVerse video models', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(makeConfig(), makeFlags({ provider: 'pixverse' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['pixverse']);
    const models = parsed.providers[0]?.models ?? [];
    assert.ok(models.includes('pixverse_v5_6_fusion'));
    assert.ok(models.includes('pixverse_v6_t2v'));
    assert.ok(models.includes('pixverse_v6_i2v'));
    assert.ok(models.includes('pixverse_v6_transition'));
  });

  it('generate audio emits a single JSON document', async () => {
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(makeConfig(), makeFlags()),
    );
    assert.ok(Array.isArray(parsed.providers));
    assert.ok(parsed.providers.some((entry) => entry.provider === 'audio'));
    assert.ok(parsed.providers.some((entry) => entry.provider === 'kling'));
  });

  it('generate audio list includes kling_video_to_audio', async () => {
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(makeConfig(), makeFlags({ provider: 'kling' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['kling']);
    assert.ok(parsed.providers[0]?.models.includes('kling_video_to_audio'));
  });

  it('generate 3d emits a single JSON document', async () => {
    const parsed = await captureJson(() =>
      generate3dCommand.execute(makeConfig(), makeFlags()),
    );
    assert.ok(Array.isArray(parsed.providers));
    assert.ok(parsed.providers.some((entry) => entry.provider === 'volces'));
    assert.ok(parsed.providers.some((entry) => entry.provider === 'tencent'));
    assert.ok(parsed.providers.some((entry) => entry.provider === 'tripo3d'));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('volces_seed3d')));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('tencent_hunyuan_3d')));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('tencent_hunyuan_3d_pro')));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('tencent_hunyuan_3d_rapid')));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('tripo3d_image_to_model')));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('tripo3d_multiview_to_model')));
    assert.ok(parsed.providers.some((entry) => entry.models.includes('tripo3d_text_to_model')));
  });

  it('list-models provider filter still works in JSON mode', async () => {
    const parsed = await captureJson(() =>
      generateImageCommand.execute(makeConfig(), makeFlags({ provider: 'volces' })),
    );
    assert.deepStrictEqual(parsed.providers.map((entry) => entry.provider), ['volces']);
  });
});
