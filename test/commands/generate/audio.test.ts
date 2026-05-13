import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import generateAudioCommand from '../../../src/commands/generate/audio.ts';
import { DEFAULT_AUDIO_MODEL } from '../../../src/commands/generate/audio.ts';
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

describe('generate audio command', () => {
  it('uses the built-in default model when --model is omitted', async () => {
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          prompt: 'epic orchestral sci-fi theme',
          dryRun: true,
        }),
      ),
    );

    assert.strictEqual(parsed.request.model, DEFAULT_AUDIO_MODEL);
  });

  it('requires prompt for lyria_3_pro_preview', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'lyria_3_pro_preview', dryRun: true }),
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
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({ model: 'not-a-real-audio-model', prompt: 'ambient texture', dryRun: true }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('not-a-real-audio-model'));
        assert.ok(err.message.includes('sac model search --query not-a-real-audio-model'));
        assert.ok(err.message.includes('sac model get <model-id>'));
        assert.ok(err.message.includes('sac generate submit --body-json'));
        return true;
      },
    );
  });

  it('rejects MiniMax-only --bitrate for non-MiniMax audio models', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'lyria_3_pro_preview',
          prompt: 'ambient texture',
          bitrate: 128000,
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--bitrate'));
        return true;
      },
    );
  });

  it('supports kling_video_to_audio dry-run', async () => {
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_video_to_audio',
          videoUrl: 'https://example.com/clip.mp4',
          soundEffectPrompt: 'rain and city ambience',
          bgmPrompt: 'warm piano',
          asmrMode: true,
          externalTaskId: 'audio-001',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'kling_video_to_audio');
    assert.strictEqual(params.video_url, 'https://example.com/clip.mp4');
    assert.strictEqual(params.sound_effect_prompt, 'rain and city ambience');
    assert.strictEqual(params.bgm_prompt, 'warm piano');
    assert.strictEqual(params.asmr_mode, true);
    assert.strictEqual(params.external_task_id, 'audio-001');
  });

  it('rejects prompt for kling_video_to_audio', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_video_to_audio',
          prompt: 'not allowed',
          videoUrl: 'https://example.com/clip.mp4',
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

  it('requires video input for kling_video_to_audio', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'kling_video_to_audio',
          soundEffectPrompt: 'rain and city ambience',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--video-id'));
        assert.ok(err.message.includes('--video-url'));
        return true;
      },
    );
  });

  it('supports minimax_music_25_plus dry-run with instrumental output settings', async () => {
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_music_25_plus',
          prompt: 'ambient piano, reflective, late night rain',
          instrumental: true,
          lyricsOptimizer: true,
          sampleRate: 44100,
          bitrate: 256000,
          format: 'wav',
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'minimax_music_25_plus');
    assert.strictEqual(params.prompt, 'ambient piano, reflective, late night rain');
    assert.strictEqual(params.is_instrumental, true);
    assert.strictEqual(params.lyrics_optimizer, true);
    assert.deepStrictEqual(params.audio_setting, {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'wav',
    });
  });

  it('requires --minimax-model for minimax_music_generation', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_music_generation',
          prompt: 'electro-pop with glossy synths',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--minimax-model'));
        return true;
      },
    );
  });

  it('supports minimax_t2a dry-run with nested voice settings', async () => {
    const parsed = await captureJson(() =>
      generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_t2a',
          prompt: '你好，这是一段测试旁白。',
          minimaxModel: 'speech-2.8-hd',
          outputFormat: 'url',
          voiceId: 'female-chengshu',
          voiceSpeed: 1.1,
          voiceVolume: 1.5,
          voicePitch: 2,
          voiceEmotion: 'calm',
          textNormalization: true,
          latexRead: true,
          sampleRate: 44100,
          bitrate: 128000,
          format: 'mp3',
          channel: 2,
          languageBoost: 'Chinese',
          pronunciationDict: '{"tone":["燕少飞/(yan4)(shao3)(fei1)"]}',
          voiceEffectPitch: 10,
          voiceEffectIntensity: -5,
          voiceEffectTimbre: 8,
          soundEffects: 'robotic',
          subtitleEnable: true,
          watermark: true,
          dryRun: true,
        }),
      ),
    );

    const params = parsed.request.input[0].params;
    assert.strictEqual(parsed.request.model, 'minimax_t2a');
    assert.strictEqual(params.model, 'speech-2.8-hd');
    assert.strictEqual(params.text, '你好，这是一段测试旁白。');
    assert.strictEqual(params.output_format, 'url');
    assert.deepStrictEqual(params.voice_setting, {
      voice_id: 'female-chengshu',
      speed: 1.1,
      vol: 1.5,
      pitch: 2,
      emotion: 'calm',
      text_normalization: true,
      latex_read: true,
    });
    assert.deepStrictEqual(params.audio_setting, {
      sample_rate: 44100,
      bitrate: '128000',
      format: 'mp3',
      channel: 2,
    });
    assert.deepStrictEqual(params.pronunciation_dict, {
      tone: ['燕少飞/(yan4)(shao3)(fei1)'],
    });
    assert.deepStrictEqual(params.voice_modify, {
      pitch: 10,
      intensity: -5,
      timbre: 8,
      sound_effects: 'robotic',
    });
    assert.strictEqual(params.language_boost, 'Chinese');
    assert.strictEqual(params.subtitle_enable, true);
    assert.strictEqual(params.aigc_watermark, true);
  });

  it('rejects --voice-id together with --timbre-weights for minimax_t2a', async () => {
    await assert.rejects(
      () => generateAudioCommand.execute(
        makeConfig({ dryRun: true }),
        makeFlags({
          model: 'minimax_t2a',
          prompt: 'test',
          voiceId: 'female-chengshu',
          timbreWeights: '[{"voice_id":"female-tianmei","weight":100}]',
          dryRun: true,
        }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('--voice-id'));
        assert.ok(err.message.includes('--timbre-weights'));
        return true;
      },
    );
  });
});
