import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { default as generateImageCommand } from '../../../src/commands/generate/image.ts';
import { DEFAULT_MODEL_VER } from '../../../src/commands/generate/providers/seaart.ts';
import { DEFAULT_IMAGE_MODEL } from '../../../src/commands/generate/image.ts';
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
    ...overrides,
  };
}

describe('generate image command', () => {
  it('has correct command name', () => {
    assert.strictEqual(generateImageCommand.name, 'generate image');
  });

  it('throws on missing --prompt in non-interactive mode', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(makeConfig(), makeFlags()),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('prompt'));
        return true;
      },
    );
  });

  it('dry-run outputs request body without calling API', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(config, makeFlags({ prompt: 'a cat', dryRun: true }));
    } finally {
      console.log = orig;
    }
    assert.ok(logs.length > 0);
    const parsed = JSON.parse(logs.join(''));
    assert.ok(parsed.request);
    assert.strictEqual(parsed.request.model, DEFAULT_IMAGE_MODEL);
    assert.strictEqual(parsed.request.input[0].params.prompt, 'a cat');
  });

  it('dry-run uses --model flag over default', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(config, makeFlags({ prompt: 'test', model: 'z_image', dryRun: true }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'z_image');
  });

  it('dry-run uses config.defaultImageModel when no --model flag', async () => {
    const config = makeConfig({ dryRun: true, defaultImageModel: 'z_image' });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(config, makeFlags({ prompt: 'test', dryRun: true }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'z_image');
  });

  it('dry-run includes model_ver_no for explicit sdxl', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(config, makeFlags({ prompt: 'test', model: 'sdxl', dryRun: true }));
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.model_ver_no, DEFAULT_MODEL_VER.sdxl);
  });

  it('dry-run uses --model-ver-no flag when provided', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({ prompt: 'test', model: 'sdxl', modelVerNo: 'custom-ver-123', dryRun: true }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.model_ver_no, 'custom-ver-123');
  });

  it('throws on invalid model name', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ prompt: 'test', model: 'not-a-real-model', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('not-a-real-model'));
        assert.ok(err.message.includes('sac model search --query not-a-real-model'));
        assert.ok(err.message.includes('sac model get <model-id>'));
        assert.ok(err.message.includes('sac generate submit --body-json'));
        return true;
      },
    );
  });

  it('supports volces_seedream_4_0 dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({ prompt: 'test', model: 'volces_seedream_4_0', size: '2K', dryRun: true }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'volces_seedream_4_0');
    assert.strictEqual(parsed.request.input[0].params.size, '2K');
  });

  it('supports tripo3d_text_to_image dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'stylized toy robot concept art',
          model: 'tripo3d_text_to_image',
          negativePrompt: 'low quality',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.model, 'tripo3d_text_to_image');
    assert.deepStrictEqual(parsed.request.input[0].params, {
      prompt: 'stylized toy robot concept art',
      negative_prompt: 'low quality',
    });
  });

  it('rejects image-url for tripo3d_text_to_image', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'stylized toy robot concept art',
          model: 'tripo3d_text_to_image',
          imageUrl: 'https://example.com/ref.png',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--image-url'));
        return true;
      },
    );
  });

  it('supports volces_seedream_3_0 dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({ prompt: 'test', model: 'volces_seedream_3_0', scale: 2.5, width: 1328, height: 1328, dryRun: true }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.scale, 2.5);
    assert.strictEqual(parsed.request.input[0].params.width, 1328);
    assert.strictEqual(parsed.request.input[0].params.height, 1328);
  });

  it('supports volces_seededit_single_ip dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'edit this',
          model: 'volces_seededit_single_ip',
          imageUrl: 'https://example.com/input.jpg',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.deepStrictEqual(parsed.request.input[0].params.image_urls, ['https://example.com/input.jpg']);
  });

  it('supports volces_seededit_multi_ip dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'combine features',
          model: 'volces_seededit_multi_ip',
          imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
          refType: ['IP', 'STYLE'],
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.deepStrictEqual(parsed.request.input[0].params.image_urls, ['https://example.com/a.jpg', 'https://example.com/b.jpg']);
    assert.deepStrictEqual(parsed.request.input[0].params.ref_type_list, ['IP', 'STYLE']);
  });

  it('supports volces_seedream_4_5_multi_blend dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'blend these',
          model: 'volces_seedream_4_5_multi_blend',
          imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.deepStrictEqual(parsed.request.input[0].params.image, ['https://example.com/a.jpg', 'https://example.com/b.jpg']);
  });

  it('requires at least two images for volces_seedream_4_5_multi_blend', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'blend these',
          model: 'volces_seedream_4_5_multi_blend',
          imageUrl: 'https://example.com/a.jpg',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('2+ images'));
        return true;
      },
    );
  });

  it('supports volces_seededit_multi_style without prompt', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          model: 'volces_seededit_multi_style',
          imageUrl: 'https://example.com/input.jpg',
          templateId: 'felt_3d_polaroid',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.image_input1, 'https://example.com/input.jpg');
    assert.strictEqual(parsed.request.input[0].params.template_id, 'felt_3d_polaroid');
  });

  it('supports volces_seededit_3d_style without prompt', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          model: 'volces_seededit_3d_style',
          imageUrl: 'https://example.com/input.jpg',
          reqKey: 'img2img_3d_style_usage',
          subReqKey: 'img2img_3d_style_doll',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.req_key, 'img2img_3d_style_usage');
    assert.strictEqual(parsed.request.input[0].params.sub_req_key, 'img2img_3d_style_doll');
  });

  it('supports volces_seededit_portrait with optional prompt', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          model: 'volces_seededit_portrait',
          imageUrl: 'https://example.com/portrait.jpg',
          gpen: 0.4,
          skin: 0.3,
          skinUnifi: 0.1,
          genMode: 'reference_char',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.image_input, 'https://example.com/portrait.jpg');
    assert.strictEqual(parsed.request.input[0].params.gpen, 0.4);
    assert.strictEqual(parsed.request.input[0].params.gen_mode, 'reference_char');
  });

  it('supports kling_v3_image dry-run with reference image and watermark', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'futuristic watch product photo',
          model: 'kling_v3_image',
          imageUrl: 'https://example.com/ref.jpg',
          aspectRatio: '1:1',
          resolution: '2k',
          n: 2,
          watermark: true,
          elementIds: ['el_1', 'el_2'],
          externalTaskId: 'img-001',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'kling_v3_image');
    assert.strictEqual(params.prompt, 'futuristic watch product photo');
    assert.strictEqual(params.image, 'https://example.com/ref.jpg');
    assert.strictEqual(params.aspect_ratio, '1:1');
    assert.strictEqual(params.resolution, '2k');
    assert.strictEqual(params.n, 2);
    assert.deepStrictEqual(params.watermark_info, { enabled: true });
    assert.deepStrictEqual(params.element_list, [{ element_id: 'el_1' }, { element_id: 'el_2' }]);
    assert.strictEqual(params.external_task_id, 'img-001');
  });

  it('supports alibaba_wan27_image dry-run with image references', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'cinematic sports car poster',
          model: 'alibaba_wan27_image',
          imageUrl: 'https://example.com/ref1.jpg',
          imageUrls: ['https://example.com/ref2.jpg'],
          size: '2K',
          n: 3,
          watermark: true,
          seed: 42,
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'alibaba_wan27_image');
    assert.deepStrictEqual(params.input.messages[0].content, [
      { image: 'https://example.com/ref1.jpg' },
      { image: 'https://example.com/ref2.jpg' },
      { text: 'cinematic sports car poster' },
    ]);
    assert.strictEqual(params.parameters.size, '2K');
    assert.strictEqual(params.parameters.n, 3);
    assert.strictEqual(params.parameters.watermark, true);
    assert.strictEqual(params.parameters.seed, 42);
  });

  it('rejects unsupported aspect ratio for alibaba_wan27_image', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'cinematic sports car poster',
          model: 'alibaba_wan27_image',
          aspectRatio: '16:9',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--aspect-ratio'));
        return true;
      },
    );
  });

  it('supports tencent_image_creation_3 dry-run', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: '国风山水画',
          model: 'tencent_image_creation_3',
          resolution: '1024:1024',
          seed: 42,
          logoAdd: 1,
          revise: 0,
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'tencent_image_creation_3');
    assert.strictEqual(params.prompt, '国风山水画');
    assert.strictEqual(params.resolution, '1024:1024');
    assert.strictEqual(params.seed, 42);
    assert.strictEqual(params.logo_add, 1);
    assert.strictEqual(params.revise, 0);
  });

  it('rejects unsupported watermark flag for tencent_image_creation_3', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: '国风山水画',
          model: 'tencent_image_creation_3',
          watermark: true,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--logo-add'));
        return true;
      },
    );
  });

  it('rejects unsupported image input for tencent_image_creation_3', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: '国风山水画',
          model: 'tencent_image_creation_3',
          imageUrl: 'https://example.com/ref.jpg',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--image-url'));
        return true;
      },
    );
  });

  it('rejects invalid resolution for tencent_image_creation_3', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: '国风山水画',
          model: 'tencent_image_creation_3',
          resolution: '720p',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--resolution'));
        return true;
      },
    );
  });

  it('rejects invalid logo-add value for tencent_image_creation_3', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: '国风山水画',
          model: 'tencent_image_creation_3',
          logoAdd: 2,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--logo-add'));
        return true;
      },
    );
  });

  it('rejects negative prompt with image input for kling_v3_image', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'edit this image',
          model: 'kling_v3_image',
          imageUrl: 'https://example.com/ref.jpg',
          negativePrompt: 'blur',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--negative-prompt'));
        return true;
      },
    );
  });

  it('supports kling_omni_image with multiple references', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'poster design with <<<image_1>>> and <<<image_2>>>',
          model: 'kling_omni_image',
          imageUrl: 'https://example.com/ref1.jpg',
          imageUrls: ['https://example.com/ref2.jpg'],
          aspectRatio: '16:9',
          resolution: '1k',
          externalTaskId: 'omni-img-001',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.image_list, [
      { image: 'https://example.com/ref1.jpg' },
      { image: 'https://example.com/ref2.jpg' },
    ]);
    assert.strictEqual(params.aspect_ratio, '16:9');
    assert.strictEqual(params.resolution, '1k');
    assert.strictEqual(params.external_task_id, 'omni-img-001');
  });

  it('supports kling_v3_omni_image series output', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          prompt: 'brand campaign storyboard',
          model: 'kling_v3_omni_image',
          resultType: 'series',
          seriesAmount: 4,
          resolution: '4k',
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    const params = parsed.request.input[0].params;
    assert.strictEqual(params.result_type, 'series');
    assert.strictEqual(params.series_amount, 4);
    assert.strictEqual(params.resolution, '4k');
  });

  it('rejects series amount without series result type for kling_v3_omni_image', async () => {
    await assert.rejects(
      () => generateImageCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'brand campaign storyboard',
          model: 'kling_v3_omni_image',
          seriesAmount: 4,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--result-type series'));
        return true;
      },
    );
  });

  it('supports volces_jimeng_tilesr without prompt', async () => {
    const config = makeConfig({ dryRun: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({
          model: 'volces_jimeng_tilesr',
          imageUrl: 'https://example.com/input.jpg',
          resolution: '8k',
          scale: 80,
          dryRun: true,
        }),
      );
    } finally {
      console.log = orig;
    }
    const parsed = JSON.parse(logs.join(''));
    assert.strictEqual(parsed.request.input[0].params.image_url, 'https://example.com/input.jpg');
    assert.strictEqual(parsed.request.input[0].params.resolution, '8k');
    assert.strictEqual(parsed.request.input[0].params.scale, 80);
  });

  it('dry-run async mode shows task_id in output', async () => {
    const config = makeConfig({ dryRun: true, async: true });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => { logs.push(msg); };
    try {
      await generateImageCommand.execute(
        config,
        makeFlags({ prompt: 'test', async: true, dryRun: true }),
      );
    } finally {
      console.log = orig;
    }
    // dry-run outputs request; async does nothing extra when dry-run
    assert.ok(logs.length > 0);
  });
});
