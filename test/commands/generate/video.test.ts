import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import generateVideoCommand from '../../../src/commands/generate/video.ts';
import { DEFAULT_VIDEO_MODEL } from '../../../src/commands/generate/video.ts';
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

describe('generate video command', () => {
  it('uses the built-in default model when --model is omitted', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'mist over a lake at sunrise',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, DEFAULT_VIDEO_MODEL);
  });

  it('requires prompt for volces_seedance_3_0', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'volces_seedance_3_0', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('prompt'));
        return true;
      },
    );
  });

  it('directs unknown models to gateway discovery', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'not-a-real-video-model', prompt: 'slow dolly shot', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('not-a-real-video-model'));
        assert.ok(err.message.includes('sac model search --query not-a-real-video-model'));
        assert.ok(err.message.includes('sac model get <model-id>'));
        assert.ok(err.message.includes('sac generate submit --body-json'));
        return true;
      },
    );
  });

  it('supports volces_seedance_3_0 dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seedance_3_0',
          prompt: 'mist over a lake at sunrise',
          resolution: '720p',
          fps: 24,
          returnLastFrame: true,
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'volces_seedance_3_0');
    assert.deepStrictEqual(parsed.request.input[0].params.content, [
      { type: 'text', text: 'mist over a lake at sunrise' },
    ]);
    assert.strictEqual(parsed.request.input[0].params.framespersecond, 24);
    assert.strictEqual(parsed.request.input[0].params.return_last_frame, true);
  });

  it('supports volces_seedance_3_0_pro without prompt when image is provided', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seedance_3_0_pro',
          imageUrl: 'https://example.com/first.jpg',
          imageTailUrl: 'https://example.com/last.jpg',
          resolution: '720p',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.input[0].params.content.length, 2);
    assert.deepStrictEqual(parsed.request.input[0].params.content[0], {
      type: 'image_url',
      image_url: { url: 'https://example.com/first.jpg' },
      role: 'first_frame',
    });
    assert.deepStrictEqual(parsed.request.input[0].params.content[1], {
      type: 'image_url',
      image_url: { url: 'https://example.com/last.jpg' },
      role: 'last_frame',
    });
  });

  it('supports volces_seedance_2_0 with mixed reference inputs', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seedance_2_0',
          prompt: 'turn this into a cinematic trailer',
          imageUrl: 'https://example.com/first.jpg',
          imageTailUrl: 'https://example.com/last.jpg',
          imageUrls: ['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg'],
          videoUrl: 'https://example.com/ref.mp4',
          audioUrl: 'https://example.com/ref.mp3',
          serviceTier: 'flex',
          audio: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.service_tier, 'flex');
    assert.strictEqual(params.generate_audio, true);
    assert.strictEqual(params.content.length, 7);
    assert.deepStrictEqual(params.content[1], {
      type: 'image_url',
      image_url: { url: 'https://example.com/first.jpg' },
      role: 'first_frame',
    });
    assert.deepStrictEqual(params.content[5], {
      type: 'video_url',
      video_url: { url: 'https://example.com/ref.mp4' },
      role: 'reference_video',
    });
  });

  it('requires --image-url for volces_seedance_30_i2v', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'volces_seedance_30_i2v', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--image-url'));
        return true;
      },
    );
  });

  it('supports volces_seedance_pro_fast with --frames', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seedance_pro_fast',
          prompt: 'camera pushes in slowly',
          imageUrl: 'https://example.com/first.jpg',
          frames: 57,
          cameraFixed: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.frames, 57);
    assert.strictEqual(params.camerafixed, true);
    assert.strictEqual(params.content.length, 2);
  });

  it('rejects --frames together with --duration for volces_seedance_pro_fast', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_seedance_pro_fast',
          prompt: 'slow pan',
          frames: 57,
          duration: 3,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--frames'));
        return true;
      },
    );
  });

  it('requires --draft-task-id for volces_draft_video', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'volces_draft_video', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--draft-task-id'));
        return true;
      },
    );
  });

  it('supports volces_jimeng_dream_actor_m2 without prompt', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_jimeng_dream_actor_m2',
          imageUrl: 'https://example.com/actor.png',
          videoUrl: 'https://example.com/template.mp4',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.input[0].params.image_url, 'https://example.com/actor.png');
    assert.strictEqual(parsed.request.input[0].params.video_url, 'https://example.com/template.mp4');
  });

  it('supports volces_realman_avatar_picture_omni_v15 optional prompt and masks', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'volces_realman_avatar_picture_omni_v15',
          imageUrl: 'https://example.com/avatar.png',
          audioUrl: 'https://example.com/voice.mp3',
          maskUrls: ['https://example.com/m1.png', 'https://example.com/m2.png'],
          prompt: 'make the speaker smile gently',
          peFastMode: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.mask_url, ['https://example.com/m1.png', 'https://example.com/m2.png']);
    assert.strictEqual(params.prompt, 'make the speaker smile gently');
    assert.strictEqual(params.pe_fast_mode, true);
  });

  it('supports vidu_q1 dry-run with style', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q1',
          prompt: 'a hand-drawn fox runs through a field',
          style: 'anime',
          aspectRatio: '1:1',
          movementAmplitude: 'medium',
          bgm: true,
          payload: 'opaque',
          callbackUrl: 'https://example.com/callback',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.prompt, 'a hand-drawn fox runs through a field');
    assert.strictEqual(params.style, 'anime');
    assert.strictEqual(params.aspect_ratio, '1:1');
    assert.strictEqual(params.movement_amplitude, 'medium');
    assert.strictEqual(params.bgm, true);
    assert.strictEqual(params.payload, 'opaque');
    assert.strictEqual(params.callback_url, 'https://example.com/callback');
  });

  it('supports minimax_t2v_01 dry-run with fixed-option overrides', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_t2v_01',
          prompt: 'a paper airplane glides through golden sunlight',
          duration: 6,
          resolution: '720P',
          promptOptimizer: 'false',
          callbackUrl: 'https://example.com/minimax-video',
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'minimax_t2v_01');
    assert.strictEqual(params.prompt, 'a paper airplane glides through golden sunlight');
    assert.strictEqual(params.duration, 6);
    assert.strictEqual(params.resolution, '720P');
    assert.strictEqual(params.prompt_optimizer, false);
    assert.strictEqual(params.callback_url, 'https://example.com/minimax-video');
    assert.strictEqual(params.aigc_watermark, true);
  });

  it('rejects unsupported duration-resolution combinations for minimax_hailuo_02', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_hailuo_02',
          prompt: 'city lights reflected on wet pavement',
          duration: 10,
          resolution: '1080P',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--duration 10'));
        assert.ok(err.message.includes('768P'));
        return true;
      },
    );
  });

  it('supports minimax_hailuo_23_fast_i2v dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_hailuo_23_fast_i2v',
          imageUrl: 'https://example.com/frame.png',
          prompt: 'gentle camera push toward the subject',
          duration: 10,
          resolution: '768P',
          promptOptimizer: 'true',
          fastPretreatment: true,
          callbackUrl: 'https://example.com/minimax-i2v',
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'minimax_hailuo_23_fast_i2v');
    assert.strictEqual(params.first_frame_image, 'https://example.com/frame.png');
    assert.strictEqual(params.prompt, 'gentle camera push toward the subject');
    assert.strictEqual(params.duration, 10);
    assert.strictEqual(params.resolution, '768P');
    assert.strictEqual(params.prompt_optimizer, true);
    assert.strictEqual(params.fast_pretreatment, true);
    assert.strictEqual(params.callback_url, 'https://example.com/minimax-i2v');
    assert.strictEqual(params.aigc_watermark, true);
  });

  it('requires --image-url for minimax_i2v_01_director', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_i2v_01_director',
          prompt: '[推进] toward the subject',
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

  it('supports vidu_q2 dry-run with off-peak', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q2',
          prompt: 'a red balloon floats above a city skyline',
          duration: 8,
          resolution: '1080p',
          aspectRatio: '4:3',
          bgm: true,
          offPeak: true,
          callbackUrl: 'https://example.com/q2-callback',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.duration, 8);
    assert.strictEqual(params.resolution, '1080p');
    assert.strictEqual(params.aspect_ratio, '4:3');
    assert.strictEqual(params.off_peak, true);
    assert.strictEqual(params.callback_url, 'https://example.com/q2-callback');
  });

  it('supports vidu_q3_turbo_i2v dry-run with watermark metadata', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q3_turbo_i2v',
          imageUrl: 'https://example.com/start.jpg',
          prompt: 'the subject turns and smiles',
          duration: 6,
          resolution: '2K',
          movementAmplitude: 'large',
          audio: true,
          offPeak: true,
          watermark: true,
          watermarkPosition: 4,
          watermarkUrl: 'https://example.com/wm.png',
          metaData: '{"label":"campaign"}',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.images, ['https://example.com/start.jpg']);
    assert.strictEqual(params.resolution, '2K');
    assert.strictEqual(params.watermark, true);
    assert.strictEqual(params.wm_position, 4);
    assert.strictEqual(params.wm_url, 'https://example.com/wm.png');
    assert.strictEqual(params.meta_data, '{"label":"campaign"}');
  });

  it('supports vidu_q3_pro_start_end with explicit first and last frames', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q3_pro_start_end',
          imageUrl: 'https://example.com/first.jpg',
          imageTailUrl: 'https://example.com/last.jpg',
          prompt: 'camera moves forward',
          duration: 5,
          resolution: '720p',
          aspectRatio: '16:9',
          audio: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.images, [
      'https://example.com/first.jpg',
      'https://example.com/last.jpg',
    ]);
    assert.strictEqual(params.prompt, 'camera moves forward');
    assert.strictEqual(params.audio, true);
  });

  it('rejects prompt together with recommend prompt for vidu_q3_turbo_start_end', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q3_turbo_start_end',
          imageUrl: 'https://example.com/first.jpg',
          imageTailUrl: 'https://example.com/last.jpg',
          prompt: 'should be ignored',
          recommendPrompt: true,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--recommend-prompt'));
        return true;
      },
    );
  });

  it('supports vidu_q3_reference dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q3_reference',
          prompt: 'a robot walks through the studio',
          imageUrl: 'https://example.com/ref-1.jpg',
          imageUrls: ['https://example.com/ref-2.jpg'],
          duration: 4,
          aspectRatio: 'auto',
          audio: true,
          watermark: true,
          watermarkPosition: 2,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.images, [
      'https://example.com/ref-1.jpg',
      'https://example.com/ref-2.jpg',
    ]);
    assert.strictEqual(params.aspect_ratio, 'auto');
    assert.strictEqual(params.watermark, true);
    assert.strictEqual(params.wm_position, 2);
  });

  it('rejects reserved sounds for vidu_q3_reference', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q3_reference',
          prompt: 'a robot walks through the studio',
          sounds: ['https://example.com/ref.mp3'],
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('reserved'));
        return true;
      },
    );
  });

  it('supports vidu_q3_mix_reference dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_q3_mix_reference',
          prompt: 'a fashion commercial with soft camera moves',
          imageUrl: 'https://example.com/front.jpg',
          imageTailUrl: 'https://example.com/back.jpg',
          imageUrls: ['https://example.com/ref-1.jpg', 'https://example.com/ref-2.jpg'],
          characterReferenceUrl: 'https://example.com/character.jpg',
          styleReferenceUrl: 'https://example.com/style.jpg',
          characterReferenceWeight: 0.8,
          styleReferenceWeight: 0.4,
          enhancePrompt: true,
          duration: 7,
          resolution: '1080p',
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.images, [
      'https://example.com/front.jpg',
      'https://example.com/ref-1.jpg',
      'https://example.com/ref-2.jpg',
    ]);
    assert.strictEqual(params.first_frame_image, 'https://example.com/front.jpg');
    assert.strictEqual(params.last_frame_image, 'https://example.com/back.jpg');
    assert.strictEqual(params.character_reference_image, 'https://example.com/character.jpg');
    assert.strictEqual(params.style_reference_image, 'https://example.com/style.jpg');
    assert.strictEqual(params.character_reference_weight, 0.8);
    assert.strictEqual(params.style_reference_weight, 0.4);
    assert.strictEqual(params.enhance_prompt, true);
  });

  it('supports vidu_template_v2 with extra params', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_template_v2',
          template: 'turn_into_zombie',
          imageUrl: 'https://example.com/person.jpg',
          prompt: 'dramatic transformation',
          templateParams: '{"strength":2}',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.template, 'turn_into_zombie');
    assert.deepStrictEqual(params.images, ['https://example.com/person.jpg']);
    assert.deepStrictEqual(params.extra_params, { strength: 2 });
  });

  it('supports vidu_ad_one_click dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_ad_one_click',
          imageUrls: ['https://example.com/product-1.jpg', 'https://example.com/product-2.jpg'],
          prompt: 'premium product launch',
          duration: 20,
          aspectRatio: '9:16',
          language: 'en',
          creative: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.duration, 20);
    assert.strictEqual(params.language, 'en');
    assert.strictEqual(params.creative, true);
  });

  it('supports vidu_one_click_mv dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_one_click_mv',
          imageUrl: 'https://example.com/model.jpg',
          audioUrl: 'https://example.com/song.mp3',
          prompt: 'soft stage lighting',
          resolution: '1080p',
          addSubtitle: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.audio_url, 'https://example.com/song.mp3');
    assert.strictEqual(params.add_subtitle, true);
    assert.strictEqual(params.resolution, '1080p');
  });

  it('supports vidu_trending_replicate dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'vidu_trending_replicate',
          videoUrl: 'https://example.com/original.mp4',
          imageUrls: ['https://example.com/product-1.jpg', 'https://example.com/product-2.jpg'],
          prompt: 'keep the same pacing but swap products',
          resolution: '720p',
          removeAudio: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.video_url, 'https://example.com/original.mp4');
    assert.strictEqual(params.remove_audio, true);
    assert.strictEqual(params.resolution, '720p');
  });

  it('supports alibaba_wan27_t2v dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'alibaba_wan27_t2v',
          prompt: 'a futuristic car launches into the sky',
          resolution: '1080P',
          aspectRatio: '16:9',
          duration: 5,
          negativePrompt: 'blurry',
          watermark: true,
          seed: 7,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'alibaba_wan27_t2v');
    assert.strictEqual(params.input.prompt, 'a futuristic car launches into the sky');
    assert.strictEqual(params.parameters.resolution, '1080P');
    assert.strictEqual(params.parameters.ratio, '16:9');
    assert.strictEqual(params.parameters.duration, 5);
    assert.strictEqual(params.parameters.negative_prompt, 'blurry');
    assert.strictEqual(params.parameters.watermark, true);
    assert.strictEqual(params.parameters.seed, 7);
  });

  it('supports alibaba_wan27_i2v dry-run with optional tail, audio, and clip', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'alibaba_wan27_i2v',
          imageUrl: 'https://example.com/first.jpg',
          imageTailUrl: 'https://example.com/last.jpg',
          audioUrl: 'https://example.com/music.mp3',
          videoUrl: 'https://example.com/clip.mp4',
          resolution: '720P',
          duration: 5,
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.input.media, [
      { type: 'first_frame', url: 'https://example.com/first.jpg' },
      { type: 'last_frame', url: 'https://example.com/last.jpg' },
      { type: 'driving_audio', url: 'https://example.com/music.mp3' },
      { type: 'first_clip', url: 'https://example.com/clip.mp4' },
    ]);
    assert.strictEqual(params.parameters.resolution, '720P');
    assert.strictEqual(params.parameters.duration, 5);
    assert.strictEqual(params.parameters.watermark, true);
  });

  it('supports alibaba_wan27_r2v dry-run with mixed media', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'alibaba_wan27_r2v',
          prompt: 'convert it into a noir trailer',
          imageUrl: 'https://example.com/first.jpg',
          imageUrls: ['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg'],
          videoUrl: 'https://example.com/ref.mp4',
          resolution: '1080P',
          aspectRatio: '4:3',
          duration: 6,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.input.media, [
      { type: 'first_frame', url: 'https://example.com/first.jpg' },
      { type: 'reference_image', url: 'https://example.com/ref1.jpg' },
      { type: 'reference_image', url: 'https://example.com/ref2.jpg' },
      { type: 'reference_video', url: 'https://example.com/ref.mp4' },
    ]);
    assert.strictEqual(params.parameters.resolution, '1080P');
    assert.strictEqual(params.parameters.ratio, '4:3');
    assert.strictEqual(params.parameters.duration, 6);
  });

  it('supports alibaba_wan27_videoedit dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'alibaba_wan27_videoedit',
          prompt: 'make it look like a retro commercial',
          videoUrl: 'https://example.com/source.mp4',
          imageUrl: 'https://example.com/style.jpg',
          resolution: '720P',
          aspectRatio: '9:16',
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.input.media, [
      { type: 'video', url: 'https://example.com/source.mp4' },
      { type: 'reference_image', url: 'https://example.com/style.jpg' },
    ]);
    assert.strictEqual(params.parameters.resolution, '720P');
    assert.strictEqual(params.parameters.ratio, '9:16');
    assert.strictEqual(params.parameters.watermark, true);
  });

  it('supports alibaba_wanx26_i2v_flash dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'alibaba_wanx26_i2v_flash',
          imageUrl: 'https://example.com/input.jpg',
          resolution: '1080P',
          duration: 5,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'alibaba_wanx26_i2v_flash');
    assert.strictEqual(params.input.img_url, 'https://example.com/input.jpg');
    assert.strictEqual(params.parameters.resolution, '1080P');
    assert.strictEqual(params.parameters.duration, 5);
  });

  it('supports kling_v2_6 dry-run with common Kling params', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v2_6',
          prompt: 'cinematic drone shot over a futuristic city',
          duration: 10,
          aspectRatio: '16:9',
          mode: 'pro',
          negativePrompt: 'blur, low quality',
          cfgScale: 0.7,
          sound: 'on',
          multiShot: true,
          shotType: 'customize',
          watermark: true,
          externalTaskId: 'ext-kling-001',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'kling_v2_6');
    const params = parsed.request.input[0].params;
    assert.strictEqual(params.prompt, 'cinematic drone shot over a futuristic city');
    assert.strictEqual(params.duration, '10');
    assert.strictEqual(params.aspect_ratio, '16:9');
    assert.strictEqual(params.mode, 'pro');
    assert.strictEqual(params.negative_prompt, 'blur, low quality');
    assert.strictEqual(params.cfg_scale, 0.7);
    assert.strictEqual(params.sound, 'on');
    assert.strictEqual(params.multi_shot, true);
    assert.strictEqual(params.shot_type, 'customize');
    assert.deepStrictEqual(params.watermark_info, { enabled: true });
    assert.strictEqual(params.external_task_id, 'ext-kling-001');
  });

  it('supports kling_v2_1_master_i2v without prompt', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v2_1_master_i2v',
          imageUrl: 'https://example.com/first.jpg',
          duration: 5,
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'kling_v2_1_master_i2v');
    const params = parsed.request.input[0].params;
    assert.strictEqual(params.image, 'https://example.com/first.jpg');
    assert.strictEqual(params.duration, '5');
    assert.ok(!('prompt' in params));
  });

  it('requires image input for kling_v2_5_turbo_i2v', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v2_5_turbo_i2v',
          prompt: 'animate this scene',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--image-url'));
        assert.ok(err.message.includes('--image-tail-url'));
        return true;
      },
    );
  });

  it('supports kling_v1_6_i2v with tail-only input', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v1_6_i2v',
          imageTailUrl: 'https://example.com/last.jpg',
          watermark: false,
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, 'kling_v1_6_i2v');
    const params = parsed.request.input[0].params;
    assert.strictEqual(params.image_tail, 'https://example.com/last.jpg');
    assert.ok(!('image' in params));
    assert.ok(!('prompt' in params));
    assert.deepStrictEqual(params.watermark_info, { enabled: false });
  });

  it('supports kling_avatar with audio url input', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_avatar',
          imageUrl: 'https://example.com/avatar.png',
          audioUrl: 'https://example.com/voice.mp3',
          prompt: 'gentle head movement',
          mode: 'pro',
          externalTaskId: 'avatar-001',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.image, 'https://example.com/avatar.png');
    assert.strictEqual(params.sound_file, 'https://example.com/voice.mp3');
    assert.strictEqual(params.prompt, 'gentle head movement');
    assert.strictEqual(params.mode, 'pro');
    assert.strictEqual(params.external_task_id, 'avatar-001');
  });

  it('rejects kling_avatar when both audio-id and audio-url are provided', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_avatar',
          imageUrl: 'https://example.com/avatar.png',
          audioId: 'aud_123',
          audioUrl: 'https://example.com/voice.mp3',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--audio-id'));
        assert.ok(err.message.includes('--audio-url'));
        return true;
      },
    );
  });

  it('supports kling_avatar with audio id input', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_avatar',
          imageUrl: 'https://example.com/avatar.png',
          audioId: 'aud_456',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.image, 'https://example.com/avatar.png');
    assert.strictEqual(params.audio_id, 'aud_456');
    assert.ok(!('sound_file' in params));
  });

  it('requires audio input for kling_avatar', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_avatar',
          imageUrl: 'https://example.com/avatar.png',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--audio-id'));
        assert.ok(err.message.includes('--audio-url'));
        return true;
      },
    );
  });

  it('supports kling_motion_control with required params', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_motion_control',
          imageUrl: 'https://example.com/actor.png',
          videoUrl: 'https://example.com/motion.mp4',
          characterOrientation: 'image',
          mode: 'std',
          prompt: 'add dramatic lighting',
          keepOriginalSound: 'yes',
          externalTaskId: 'motion-001',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.image_url, 'https://example.com/actor.png');
    assert.strictEqual(params.video_url, 'https://example.com/motion.mp4');
    assert.strictEqual(params.character_orientation, 'image');
    assert.strictEqual(params.mode, 'std');
    assert.strictEqual(params.prompt, 'add dramatic lighting');
    assert.strictEqual(params.keep_original_sound, 'yes');
    assert.strictEqual(params.external_task_id, 'motion-001');
    assert.ok(!('watermark_info' in params));
  });

  it('requires character orientation for kling_motion_control', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_motion_control',
          imageUrl: 'https://example.com/actor.png',
          videoUrl: 'https://example.com/motion.mp4',
          mode: 'std',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--character-orientation'));
        return true;
      },
    );
  });

  it('supports kling_v3_motion_control watermark mapping', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v3_motion_control',
          imageUrl: 'https://example.com/actor.png',
          videoUrl: 'https://example.com/motion.mp4',
          characterOrientation: 'video',
          mode: 'pro',
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.character_orientation, 'video');
    assert.deepStrictEqual(params.watermark_info, { enabled: true });
  });

  it('supports kling_duration_extension with extension params', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_duration_extension',
          videoUrl: 'https://example.com/input.mp4',
          duration: 10,
          aspectRatio: '16:9',
          extensionType: 'both',
          videoQuality: 'high',
          seed: 42,
          externalTaskId: 'extend-001',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.video_url, 'https://example.com/input.mp4');
    assert.strictEqual(params.duration, '10');
    assert.strictEqual(params.aspect_ratio, '16:9');
    assert.strictEqual(params.extension_type, 'both');
    assert.strictEqual(params.quality, 'high');
    assert.strictEqual(params.seed, 42);
    assert.strictEqual(params.external_task_id, 'extend-001');
  });

  it('requires video input for kling_duration_extension', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_duration_extension',
          duration: 10,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--video-url'));
        return true;
      },
    );
  });

  it('requires exactly two images for kling_effects_multi_v15', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_effects_multi_v15',
          imageUrls: ['https://example.com/a.png'],
          effectScene: 'hug',
          duration: 5,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('exactly 2 input images'));
        return true;
      },
    );
  });

  it('supports kling_effects_multi_v16 with image-url plus image-urls', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_effects_multi_v16',
          imageUrl: 'https://example.com/a.png',
          imageUrls: ['https://example.com/b.png'],
          effectScene: 'kiss',
          duration: 5,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.input, {
      images: ['https://example.com/a.png', 'https://example.com/b.png'],
      duration: 5,
    });
    assert.strictEqual(params.effect_scene, 'kiss');
  });

  it('supports kling_effects_single with one image', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_effects_single',
          imageUrl: 'https://example.com/person.png',
          effectScene: 'baseball',
          duration: 5,
          externalTaskId: 'effect-001',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.input, {
      images: ['https://example.com/person.png'],
      duration: 5,
    });
    assert.strictEqual(params.effect_scene, 'baseball');
    assert.strictEqual(params.external_task_id, 'effect-001');
  });

  it('requires effect scene for kling_effects_single', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_effects_single',
          imageUrl: 'https://example.com/person.png',
          duration: 5,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--effect-scene'));
        return true;
      },
    );
  });

  it('supports kling_omni_video prompt-only generation with aspect ratio', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_omni_video',
          prompt: 'a toy robot waves to camera in a bright studio',
          aspectRatio: '16:9',
          duration: 5,
          mode: 'pro',
          externalTaskId: 'omni-video-001',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.prompt, 'a toy robot waves to camera in a bright studio');
    assert.strictEqual(params.aspect_ratio, '16:9');
    assert.strictEqual(params.duration, '5');
    assert.strictEqual(params.mode, 'pro');
    assert.strictEqual(params.external_task_id, 'omni-video-001');
  });

  it('rejects base video editing mixed with first frame for kling_omni_video', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_omni_video',
          prompt: 'edit this video',
          imageUrl: 'https://example.com/first.jpg',
          videoUrl: 'https://example.com/base.mp4',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--video-refer-type is base'));
        return true;
      },
    );
  });

  it('supports kling_v3_omni_video with feature video and sound', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v3_omni_video',
          prompt: 'turn this into a glossy product ad',
          imageUrl: 'https://example.com/first.jpg',
          videoUrl: 'https://example.com/ref.mp4',
          videoReferType: 'feature',
          sound: 'on',
          mode: 'std',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.sound, 'on');
    assert.deepStrictEqual(params.image_list, [{ image_url: 'https://example.com/first.jpg', type: 'first_frame' }]);
    assert.deepStrictEqual(params.video_list, [{
      video_url: 'https://example.com/ref.mp4',
      refer_type: 'feature',
    }]);
  });

  it('rejects invalid video-refer-type for kling_v3_omni_video', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_v3_omni_video',
          prompt: 'turn this into a glossy product ad',
          videoUrl: 'https://example.com/ref.mp4',
          videoReferType: 'unsupported',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--video-refer-type'));
        return true;
      },
    );
  });

  it('requires aspect ratio for prompt-only kling_omni_video generation', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_omni_video',
          prompt: 'robot in studio',
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

  it('supports kling_lipsync text2video mode', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_lipsync',
          prompt: '你好，欢迎来到 SeaArt',
          lipsyncMode: 'text2video',
          videoUrl: 'https://example.com/face.mp4',
          voiceId: 'voice_123',
          voiceLanguage: 'zh',
          voiceSpeed: 1.2,
          dryRun: true,
        }),
      ),
    );

    const input = parsed.request.input[0].params.input;
    assert.strictEqual(input.mode, 'text2video');
    assert.strictEqual(input.video_url, 'https://example.com/face.mp4');
    assert.strictEqual(input.text, '你好，欢迎来到 SeaArt');
    assert.strictEqual(input.voice_id, 'voice_123');
    assert.strictEqual(input.voice_language, 'zh');
    assert.strictEqual(input.voice_speed, 1.2);
  });

  it('supports kling_lipsync audio2video mode without prompt', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_lipsync',
          lipsyncMode: 'audio2video',
          videoId: 'vid_123',
          audioUrl: 'https://example.com/voice.mp3',
          dryRun: true,
        }),
      ),
    );

    const input = parsed.request.input[0].params.input;
    assert.strictEqual(input.mode, 'audio2video');
    assert.strictEqual(input.video_id, 'vid_123');
    assert.strictEqual(input.audio_type, 'url');
    assert.strictEqual(input.audio_url, 'https://example.com/voice.mp3');
  });

  it('rejects prompt in kling_lipsync audio2video mode', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_lipsync',
          prompt: 'should not be here',
          lipsyncMode: 'audio2video',
          videoUrl: 'https://example.com/face.mp4',
          audioUrl: 'https://example.com/voice.mp3',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('does not use --prompt'));
        return true;
      },
    );
  });

  it('supports tencent_kling_v3 dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_kling_v3',
          prompt: 'a futuristic runner sprints through neon rain',
          imageUrl: 'https://example.com/first.jpg',
          duration: 5,
          sound: 'off',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'tencent_kling_v3');
    assert.strictEqual(params.image, 'https://example.com/first.jpg');
    assert.strictEqual(params.prompt, 'a futuristic runner sprints through neon rain');
    assert.strictEqual(params.duration, '5');
    assert.strictEqual(params.sound, 'off');
  });

  it('supports tencent_kling_v3_omni prompt-only generation', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_kling_v3_omni',
          prompt: 'a futuristic runner sprints through neon rain',
          aspectRatio: '16:9',
          duration: 5,
          sound: 'on',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'tencent_kling_v3_omni');
    assert.strictEqual(params.prompt, 'a futuristic runner sprints through neon rain');
    assert.strictEqual(params.aspect_ratio, '16:9');
    assert.strictEqual(params.sound, 'on');
  });

  it('supports tencent_mps_super_resolution dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_mps_super_resolution',
          videoUrl: 'https://example.com/input.mp4',
          resolution: '1080P',
          short: 1,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'tencent_mps_super_resolution');
    assert.strictEqual(params.input_url, 'https://example.com/input.mp4');
    assert.strictEqual(params.definition, '1080P');
    assert.strictEqual(params.short, 1);
  });

  it('supports pixverse_v5_i2v dry-run with legacy motion controls', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'pixverse_v5_i2v',
          imageUrl: 'https://example.com/start.jpg',
          imageUrls: ['https://example.com/ref.jpg'],
          prompt: 'the subject starts walking',
          resolution: '720p',
          duration: 5,
          motionMode: 'fast',
          cameraMovement: 'zoom_in',
          soundEffect: true,
          soundEffectPrompt: 'city ambience',
          lipSync: true,
          ttsText: 'Welcome to SeaArt',
          voiceId: 'speaker-1',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.img_id, 'https://example.com/start.jpg');
    assert.deepStrictEqual(params.img_ids, [
      'https://example.com/start.jpg',
      'https://example.com/ref.jpg',
    ]);
    assert.strictEqual(params.motion_mode, 'fast');
    assert.strictEqual(params.camera_movement, 'zoom_in');
    assert.strictEqual(params.sound_effect_switch, true);
    assert.strictEqual(params.sound_effect_content, 'city ambience');
    assert.strictEqual(params.lip_sync_tts_switch, true);
    assert.strictEqual(params.lip_sync_tts_content, 'Welcome to SeaArt');
    assert.strictEqual(params.lip_sync_tts_speaker_id, 'speaker-1');
  });

  it('supports pixverse_v5_5_t2v dry-run with audio, multi-shot, and thinking', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'pixverse_v5_5_t2v',
          prompt: 'a mech walks across the runway',
          aspectRatio: '16:9',
          resolution: '720p',
          duration: 8,
          audio: true,
          multiShot: true,
          thinkingType: 'auto',
          soundEffectPrompt: 'metal footsteps',
          ttsText: 'systems online',
          voiceId: 'speaker-2',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.generate_audio_switch, true);
    assert.strictEqual(params.generate_multi_clip_switch, true);
    assert.strictEqual(params.thinking_type, 'auto');
    assert.strictEqual(params.sound_effect_content, 'metal footsteps');
    assert.strictEqual(params.lip_sync_tts_content, 'systems online');
    assert.strictEqual(params.lip_sync_tts_speaker_id, 'speaker-2');
  });

  it('rejects --aspect-ratio for pixverse_v6_i2v', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'pixverse_v6_i2v',
          imageUrl: 'https://example.com/start.jpg',
          prompt: 'the subject turns around',
          resolution: '720p',
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

  it('supports pixverse_v5_6_fusion dry-run', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'pixverse_v5_6_fusion',
          prompt: '@hero runs through neon rain',
          imageUrl: 'https://example.com/hero.jpg',
          referenceNames: ['hero'],
          referenceTypes: ['subject'],
          aspectRatio: '16:9',
          resolution: '720p',
          duration: 5,
          audio: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(params.model, 'v5.6');
    assert.strictEqual(params.aspect_ratio, '16:9');
    assert.strictEqual(params.generate_audio_switch, true);
    assert.deepStrictEqual(params.image_references, [
      {
        type: 'subject',
        image_url: 'https://example.com/hero.jpg',
        ref_name: 'hero',
      },
    ]);
  });

  it('supports pixverse_v5_6_fusion prompt references with punctuation and regex characters', async () => {
    const parsed = await captureJson(() =>
      generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'pixverse_v5_6_fusion',
          prompt: '@hero.v2, runs through neon rain.',
          imageUrl: 'https://example.com/hero.jpg',
          referenceNames: ['hero.v2'],
          referenceTypes: ['subject'],
          aspectRatio: '16:9',
          resolution: '720p',
          duration: 5,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.deepStrictEqual(params.image_references, [
      {
        type: 'subject',
        image_url: 'https://example.com/hero.jpg',
        ref_name: 'hero.v2',
      },
    ]);
  });

  it('rejects pixverse-only flags for non-pixverse models', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'alibaba_wan27_t2v',
          prompt: 'a futuristic city',
          motionMode: 'fast',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--motion-mode'));
        return true;
      },
    );
  });

  it('requires --video-url for tencent_mps_super_resolution', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_mps_super_resolution',
          resolution: '1080P',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--video-url'));
        return true;
      },
    );
  });

  it('rejects prompt for tencent_mps_super_resolution', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_mps_super_resolution',
          prompt: 'upscale this',
          videoUrl: 'https://example.com/input.mp4',
          resolution: '1080P',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--prompt'));
        return true;
      },
    );
  });

  it('rejects invalid resolution for tencent_mps_super_resolution', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_mps_super_resolution',
          videoUrl: 'https://example.com/input.mp4',
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

  it('rejects invalid short flag for tencent_mps_super_resolution', async () => {
    await assert.rejects(
      () => generateVideoCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'tencent_mps_super_resolution',
          videoUrl: 'https://example.com/input.mp4',
          resolution: '1080P',
          short: 2,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--short'));
        return true;
      },
    );
  });
});
