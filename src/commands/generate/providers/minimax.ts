import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const FIXED_T2V_MODELS = [
  'minimax_t2v_01',
  'minimax_t2v_01_director',
] as const;

const FIXED_I2V_MODELS = [
  'minimax_i2v_01_live',
  'minimax_i2v_01',
  'minimax_i2v_01_director',
] as const;

const HAILUO_T2V_MODELS = [
  'minimax_hailuo_02',
] as const;

const HAILUO_I2V_MODELS = [
  'minimax_hailuo_02_i2v',
  'minimax_hailuo_23_fast_i2v',
  'minimax_hailuo_23_i2v',
] as const;

const MUSIC_25_MODELS = [
  'minimax_music_25',
  'minimax_music_25_plus',
  'minimax_music_generation',
] as const;

const T2A_MODELS = [
  'minimax_t2a',
] as const;

const FIXED_DURATION = new Set([6]);
const FIXED_RESOLUTION = new Set(['720P']);
const HAILUO_02_T2V_RESOLUTIONS = new Set(['768P', '1080P']);
const HAILUO_02_I2V_RESOLUTIONS = new Set(['512P', '768P', '1080P']);
const HAILUO_23_FAST_I2V_RESOLUTIONS = new Set(['512P', '768P', '1080P']);
const HAILUO_23_I2V_RESOLUTIONS = new Set(['768P', '1080P']);
const HAILUO_DURATIONS = new Set([6, 10]);
const MUSIC_SAMPLE_RATES = new Set([16000, 24000, 32000, 44100]);
const MUSIC_BITRATES = new Set([32000, 64000, 128000, 256000]);
const MUSIC_FORMATS = new Set(['mp3', 'wav', 'pcm']);
const T2A_MODEL_VARIANTS = new Set([
  'speech-2.8-hd',
  'speech-2.8-turbo',
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-02-hd',
  'speech-02-turbo',
  'speech-01-hd',
  'speech-01-turbo',
  'speech-2.5-hd-preview',
]);
const MUSIC_GENERATION_VARIANTS = new Set([
  'music-2.6',
  'music-cover',
  'music-2.6-free',
  'music-cover-free',
]);
const T2A_OUTPUT_FORMATS = new Set(['url', 'hex']);
const T2A_AUDIO_SAMPLE_RATES = new Set([8000, 16000, 22050, 24000, 32000, 44100]);
const T2A_AUDIO_BITRATES = new Set([32000, 64000, 128000, 256000]);
const T2A_AUDIO_FORMATS = new Set(['mp3', 'pcm', 'flac', 'wav']);
const T2A_CHANNELS = new Set([1, 2]);
const T2A_EMOTIONS = new Set([
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
  'calm',
  'fluent',
  'whisper',
]);
const T2A_LANGUAGE_BOOSTS = new Set([
  'Chinese',
  'Chinese,Yue',
  'English',
  'Arabic',
  'Russian',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Turkish',
  'Dutch',
  'Ukrainian',
  'Vietnamese',
  'Indonesian',
  'Japanese',
  'Italian',
  'Korean',
  'Thai',
  'Polish',
  'Romanian',
  'Greek',
  'Czech',
  'Finnish',
  'Hindi',
  'Bulgarian',
  'Danish',
  'Hebrew',
  'Malay',
  'Persian',
  'Slovak',
  'Swedish',
  'Croatian',
  'Filipino',
  'Hungarian',
  'Norwegian',
  'Slovenian',
  'Catalan',
  'Nynorsk',
  'Tamil',
  'Afrikaans',
  'auto',
]);
const T2A_SOUND_EFFECTS = new Set([
  'spacious_echo',
  'auditorium_echo',
  'lofi_telephone',
  'robotic',
]);

function buildEnvelope(model: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    dash_scope: true,
    moderation: true,
    input: [{ params }],
    metadata: {},
  };
}

function maybeString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value;
}

function maybeBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') return undefined;
  return value;
}

function assertUnsupported(model: string, value: unknown, flagName: string, hint?: string): void {
  if (value === undefined) return;
  throw new CLIError(
    hint ?? `Model "${model}" does not support --${flagName}.`,
    ExitCode.USAGE,
  );
}

function parseInteger(
  model: string,
  value: unknown,
  flagName: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isInteger(value)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be an integer.`,
      ExitCode.USAGE,
    );
  }
  if (options.min !== undefined && value < options.min) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be at least ${options.min}.`,
      ExitCode.USAGE,
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be at most ${options.max}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseNumber(
  model: string,
  value: unknown,
  flagName: string,
  options: { min?: number; max?: number; exclusiveMin?: number } = {},
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a number.`,
      ExitCode.USAGE,
    );
  }
  if (options.min !== undefined && value < options.min) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be at least ${options.min}.`,
      ExitCode.USAGE,
    );
  }
  if (options.exclusiveMin !== undefined && value <= options.exclusiveMin) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be greater than ${options.exclusiveMin}.`,
      ExitCode.USAGE,
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be at most ${options.max}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseEnumString(model: string, value: unknown, flagName: string, allowed: Set<string>): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be one of: ${Array.from(allowed).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseEnumNumber(model: string, value: unknown, flagName: string, allowed: Set<number>): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || !allowed.has(value)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be one of: ${Array.from(allowed).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseBooleanString(model: string, value: unknown, flagName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new CLIError(
    `Model "${model}" requires --${flagName} to be "true" or "false".`,
    ExitCode.USAGE,
  );
}

function parseJsonObject(model: string, value: unknown, flagName: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a non-empty JSON object string.`,
      ExitCode.USAGE,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be valid JSON.`,
      ExitCode.USAGE,
    );
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a JSON object.`,
      ExitCode.USAGE,
    );
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(model: string, value: unknown, flagName: string): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a non-empty JSON array string.`,
      ExitCode.USAGE,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be valid JSON.`,
      ExitCode.USAGE,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a JSON array.`,
      ExitCode.USAGE,
    );
  }
  return parsed;
}

function requireImage(model: string, flags: GlobalFlags): string {
  const image = maybeString(flags.imageUrl);
  if (!image) {
    throw new CLIError(
      `Model "${model}" requires --image-url.`,
      ExitCode.USAGE,
    );
  }
  return image;
}

function assertUnsupportedMinimaxVideoFlags(model: string, flags: GlobalFlags): void {
  const entries: Array<[string, unknown]> = [
    ['aspect-ratio', flags.aspectRatio],
    ['short', flags.short],
    ['size', flags.size],
    ['motion-mode', flags.motionMode],
    ['camera-movement', flags.cameraMovement],
    ['template-id', flags.templateId],
    ['fps', flags.fps],
    ['frames', flags.frames],
    ['service-tier', flags.serviceTier],
    ['style', flags.style],
    ['payload', flags.payload],
    ['off-peak', flags.offPeak],
    ['recommend-prompt', flags.recommendPrompt],
    ['enhance-prompt', flags.enhancePrompt],
    ['template', flags.template],
    ['template-params', flags.templateParams],
    ['language', flags.language],
    ['creative', flags.creative],
    ['add-subtitle', flags.addSubtitle],
    ['remove-audio', flags.removeAudio],
    ['watermark-position', flags.watermarkPosition],
    ['watermark-url', flags.watermarkUrl],
    ['meta-data', flags.metaData],
    ['external-task-id', flags.externalTaskId],
    ['element-ids', flags.elementIds],
    ['effect-scene', flags.effectScene],
    ['character-orientation', flags.characterOrientation],
    ['keep-original-sound', flags.keepOriginalSound],
    ['video-refer-type', flags.videoReferType],
    ['lipsync-mode', flags.lipsyncMode],
    ['camera-fixed', flags.cameraFixed],
    ['return-last-frame', flags.returnLastFrame],
    ['draft', flags.draft],
    ['image-tail-url', flags.imageTailUrl],
    ['image-urls', flags.imageUrls],
    ['character-reference-url', flags.characterReferenceUrl],
    ['style-reference-url', flags.styleReferenceUrl],
    ['character-reference-weight', flags.characterReferenceWeight],
    ['style-reference-weight', flags.styleReferenceWeight],
    ['reference-urls', flags.referenceUrls],
    ['video-url', flags.videoUrl],
    ['video-id', flags.videoId],
    ['draft-task-id', flags.draftTaskId],
    ['mask-urls', flags.maskUrls],
    ['movement-amplitude', flags.movementAmplitude],
    ['mode', flags.mode],
    ['shot-type', flags.shotType],
    ['multi-shot', flags.multiShot],
    ['negative-prompt', flags.negativePrompt],
    ['cfg-scale', flags.cfgScale],
    ['video-quality', flags.videoQuality],
    ['pe-fast-mode', flags.peFastMode],
    ['audio', flags.audio],
    ['audio-id', flags.audioId],
    ['voice-id', flags.voiceId],
    ['voice-language', flags.voiceLanguage],
    ['voice-speed', flags.voiceSpeed],
    ['bgm', flags.bgm],
    ['sound', flags.sound],
    ['sound-effect', flags.soundEffect],
    ['sound-effect-prompt', flags.soundEffectPrompt],
    ['lip-sync', flags.lipSync],
    ['tts-text', flags.ttsText],
    ['audio-url', flags.audioUrl],
    ['sounds', flags.sounds],
    ['bitrate', flags.bitrate],
    ['extension-type', flags.extensionType],
    ['reference-names', flags.referenceNames],
    ['reference-types', flags.referenceTypes],
    ['thinking-type', flags.thinkingType],
  ];

  for (const [flagName, value] of entries) {
    assertUnsupported(model, value, flagName);
  }
}

function assertUnsupportedMinimaxAudioFlags(model: string, flags: GlobalFlags): void {
  const entries: Array<[string, unknown]> = [
    ['n', flags.n],
    ['reference-id', flags.referenceId],
    ['vocal-id', flags.vocalId],
    ['melody-id', flags.melodyId],
    ['video-url', flags.videoUrl],
    ['video-id', flags.videoId],
    ['sound-effect-prompt', flags.soundEffectPrompt],
    ['bgm-prompt', flags.bgmPrompt],
    ['asmr-mode', flags.asmrMode],
    ['external-task-id', flags.externalTaskId],
    ['audio-id', flags.audioId],
    ['audio-url', flags.audioUrl],
    ['sounds', flags.sounds],
    ['callback-url', flags.callbackUrl],
  ];

  for (const [flagName, value] of entries) {
    assertUnsupported(model, value, flagName);
  }
}

function applyFixedVideoOptions(model: string, params: Record<string, unknown>, flags: GlobalFlags): void {
  const duration = parseEnumNumber(model, flags.duration, 'duration', FIXED_DURATION);
  const resolution = parseEnumString(model, flags.resolution, 'resolution', FIXED_RESOLUTION);
  const promptOptimizer = parseBooleanString(model, flags.promptOptimizer, 'prompt-optimizer');
  if (duration !== undefined) params['duration'] = duration;
  if (resolution !== undefined) params['resolution'] = resolution;
  if (promptOptimizer !== undefined) params['prompt_optimizer'] = promptOptimizer;
  if (flags.callbackUrl) params['callback_url'] = flags.callbackUrl as string;
  if (flags.watermark !== undefined) params['aigc_watermark'] = flags.watermark as boolean;
  assertUnsupported(model, flags.fastPretreatment, 'fast-pretreatment');
}

function applyHailuoVideoOptions(
  model: string,
  params: Record<string, unknown>,
  flags: GlobalFlags,
  allowedResolutions: Set<string>,
): void {
  const duration = parseEnumNumber(model, flags.duration, 'duration', HAILUO_DURATIONS);
  const resolution = parseEnumString(model, flags.resolution, 'resolution', allowedResolutions);
  const promptOptimizer = parseBooleanString(model, flags.promptOptimizer, 'prompt-optimizer');

  if (duration === 10 && resolution === '1080P') {
    throw new CLIError(
      `Model "${model}" only supports --duration 10 with --resolution 768P.`,
      ExitCode.USAGE,
    );
  }

  if (duration !== undefined) params['duration'] = duration;
  if (resolution !== undefined) params['resolution'] = resolution;
  if (promptOptimizer !== undefined) params['prompt_optimizer'] = promptOptimizer;
  if (flags.fastPretreatment !== undefined) params['fast_pretreatment'] = flags.fastPretreatment as boolean;
  if (flags.callbackUrl) params['callback_url'] = flags.callbackUrl as string;
  if (flags.watermark !== undefined) params['aigc_watermark'] = flags.watermark as boolean;
}

function buildMusicAudioSetting(model: string, flags: GlobalFlags): Record<string, unknown> | undefined {
  const sampleRate = parseEnumNumber(model, flags.sampleRate, 'sample-rate', MUSIC_SAMPLE_RATES);
  const bitrate = parseEnumNumber(model, flags.bitrate, 'bitrate', MUSIC_BITRATES);
  const format = parseEnumString(model, flags.format, 'format', MUSIC_FORMATS);
  assertUnsupported(model, flags.channel, 'channel');
  assertUnsupported(model, flags.outputFormat, 'output-format');
  assertUnsupported(model, flags.voiceId, 'voice-id');
  assertUnsupported(model, flags.voiceSpeed, 'voice-speed');
  assertUnsupported(model, flags.voiceVolume, 'voice-volume');
  assertUnsupported(model, flags.voicePitch, 'voice-pitch');
  assertUnsupported(model, flags.voiceEmotion, 'voice-emotion');
  assertUnsupported(model, flags.textNormalization, 'text-normalization');
  assertUnsupported(model, flags.latexRead, 'latex-read');
  assertUnsupported(model, flags.languageBoost, 'language-boost');
  assertUnsupported(model, flags.pronunciationDict, 'pronunciation-dict');
  assertUnsupported(model, flags.timbreWeights, 'timbre-weights');
  assertUnsupported(model, flags.voiceEffectPitch, 'voice-effect-pitch');
  assertUnsupported(model, flags.voiceEffectIntensity, 'voice-effect-intensity');
  assertUnsupported(model, flags.voiceEffectTimbre, 'voice-effect-timbre');
  assertUnsupported(model, flags.soundEffects, 'sound-effects');
  assertUnsupported(model, flags.subtitleEnable, 'subtitle-enable');
  assertUnsupported(model, flags.watermark, 'watermark');

  const audioSetting: Record<string, unknown> = {};
  if (sampleRate !== undefined) audioSetting['sample_rate'] = sampleRate;
  if (bitrate !== undefined) audioSetting['bitrate'] = bitrate;
  if (format !== undefined) audioSetting['format'] = format;
  return Object.keys(audioSetting).length > 0 ? audioSetting : undefined;
}

function ensureMusicInput(model: string, prompt: string, lyrics: string | undefined): void {
  if (!prompt && !lyrics) {
    throw new CLIError(
      `Model "${model}" requires at least one of --prompt or --lyrics.`,
      ExitCode.USAGE,
    );
  }
}

registerProvider({
  provider: 'minimax',
  category: 'video',
  models: FIXED_T2V_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedMinimaxVideoFlags(model, flags);

    const params: Record<string, unknown> = { prompt };
    applyFixedVideoOptions(model, params, flags);
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'minimax',
  category: 'video',
  models: FIXED_I2V_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedMinimaxVideoFlags(model, flags);

    const params: Record<string, unknown> = {
      first_frame_image: requireImage(model, flags),
    };
    if (prompt) params['prompt'] = prompt;
    applyFixedVideoOptions(model, params, flags);
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'minimax',
  category: 'video',
  models: HAILUO_T2V_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedMinimaxVideoFlags(model, flags);

    const params: Record<string, unknown> = { prompt };
    applyHailuoVideoOptions(model, params, flags, HAILUO_02_T2V_RESOLUTIONS);
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'minimax',
  category: 'video',
  models: HAILUO_I2V_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedMinimaxVideoFlags(model, flags);

    const params: Record<string, unknown> = {
      first_frame_image: requireImage(model, flags),
    };
    if (prompt) params['prompt'] = prompt;

    if (model === 'minimax_hailuo_02_i2v') {
      applyHailuoVideoOptions(model, params, flags, HAILUO_02_I2V_RESOLUTIONS);
    } else if (model === 'minimax_hailuo_23_fast_i2v') {
      applyHailuoVideoOptions(model, params, flags, HAILUO_23_FAST_I2V_RESOLUTIONS);
    } else {
      applyHailuoVideoOptions(model, params, flags, HAILUO_23_I2V_RESOLUTIONS);
    }

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'minimax',
  category: 'audio',
  models: MUSIC_25_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedMinimaxAudioFlags(model, flags);

    const lyrics = maybeString(flags.lyrics);
    ensureMusicInput(model, prompt, lyrics);

    const lyricsOptimizer = maybeBoolean(flags.lyricsOptimizer);
    const instrumental = maybeBoolean(flags.instrumental);

    if (model === 'minimax_music_25' && instrumental !== undefined) {
      throw new CLIError(
        `Model "${model}" does not support --instrumental.`,
        ExitCode.USAGE,
      );
    }

    if ((model === 'minimax_music_25' || model === 'minimax_music_25_plus') && flags.minimaxModel !== undefined) {
      throw new CLIError(
        `Model "${model}" does not support --minimax-model.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = {};
    if (lyrics) params['lyrics'] = lyrics;
    if (prompt) params['prompt'] = prompt;

    const audioSetting = buildMusicAudioSetting(model, flags);
    if (audioSetting) params['audio_setting'] = audioSetting;
    if (lyricsOptimizer !== undefined) params['lyrics_optimizer'] = lyricsOptimizer;
    if (instrumental !== undefined) params['is_instrumental'] = instrumental;

    if (model === 'minimax_music_generation') {
      const minimaxModel = parseEnumString(model, flags.minimaxModel, 'minimax-model', MUSIC_GENERATION_VARIANTS);
      if (!minimaxModel) {
        throw new CLIError(
          `Model "${model}" requires --minimax-model.`,
          ExitCode.USAGE,
        );
      }
      params['model'] = minimaxModel;
    }

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'minimax',
  category: 'audio',
  models: T2A_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedMinimaxAudioFlags(model, flags);
    assertUnsupported(model, flags.lyrics, 'lyrics');
    assertUnsupported(model, flags.lyricsOptimizer, 'lyrics-optimizer');
    assertUnsupported(model, flags.instrumental, 'instrumental');

    const params: Record<string, unknown> = {
      text: prompt,
    };

    const minimaxModel = parseEnumString(model, flags.minimaxModel, 'minimax-model', T2A_MODEL_VARIANTS);
    if (minimaxModel) params['model'] = minimaxModel;

    const outputFormat = parseEnumString(model, flags.outputFormat, 'output-format', T2A_OUTPUT_FORMATS);
    if (outputFormat) params['output_format'] = outputFormat;

    const voiceId = maybeString(flags.voiceId);
    const timbreWeights = parseJsonArray(model, flags.timbreWeights, 'timbre-weights');
    if (voiceId && timbreWeights) {
      throw new CLIError(
        `Model "${model}" does not allow --voice-id together with --timbre-weights.`,
        ExitCode.USAGE,
      );
    }

    const voiceSetting: Record<string, unknown> = {};
    if (voiceId) voiceSetting['voice_id'] = voiceId;

    const voiceSpeed = parseNumber(model, flags.voiceSpeed, 'voice-speed', { min: 0.5, max: 2 });
    if (voiceSpeed !== undefined) voiceSetting['speed'] = voiceSpeed;

    const voiceVolume = parseNumber(model, flags.voiceVolume, 'voice-volume', { exclusiveMin: 0, max: 10 });
    if (voiceVolume !== undefined) voiceSetting['vol'] = voiceVolume;

    const voicePitch = parseInteger(model, flags.voicePitch, 'voice-pitch', { min: -12, max: 12 });
    if (voicePitch !== undefined) voiceSetting['pitch'] = voicePitch;

    const voiceEmotion = parseEnumString(model, flags.voiceEmotion, 'voice-emotion', T2A_EMOTIONS);
    if (voiceEmotion) voiceSetting['emotion'] = voiceEmotion;

    if (flags.textNormalization !== undefined) {
      voiceSetting['text_normalization'] = flags.textNormalization as boolean;
    }
    if (flags.latexRead !== undefined) {
      voiceSetting['latex_read'] = flags.latexRead as boolean;
    }
    if (Object.keys(voiceSetting).length > 0) params['voice_setting'] = voiceSetting;

    const audioSetting: Record<string, unknown> = {};
    const sampleRate = parseEnumNumber(model, flags.sampleRate, 'sample-rate', T2A_AUDIO_SAMPLE_RATES);
    if (sampleRate !== undefined) audioSetting['sample_rate'] = sampleRate;

    const bitrate = parseEnumNumber(model, flags.bitrate, 'bitrate', T2A_AUDIO_BITRATES);
    if (bitrate !== undefined) audioSetting['bitrate'] = String(bitrate);

    const format = parseEnumString(model, flags.format, 'format', T2A_AUDIO_FORMATS);
    if (format) audioSetting['format'] = format;

    const channel = parseEnumNumber(model, flags.channel, 'channel', T2A_CHANNELS);
    if (channel !== undefined) audioSetting['channel'] = channel;

    if (Object.keys(audioSetting).length > 0) params['audio_setting'] = audioSetting;

    const pronunciationDict = parseJsonObject(model, flags.pronunciationDict, 'pronunciation-dict');
    if (pronunciationDict) params['pronunciation_dict'] = pronunciationDict;
    if (timbreWeights) params['timber_weights'] = timbreWeights;

    const languageBoost = parseEnumString(model, flags.languageBoost, 'language-boost', T2A_LANGUAGE_BOOSTS);
    if (languageBoost) params['language_boost'] = languageBoost;

    const voiceModify: Record<string, unknown> = {};
    const effectPitch = parseInteger(model, flags.voiceEffectPitch, 'voice-effect-pitch', { min: -100, max: 100 });
    if (effectPitch !== undefined) voiceModify['pitch'] = effectPitch;

    const effectIntensity = parseInteger(model, flags.voiceEffectIntensity, 'voice-effect-intensity', { min: -100, max: 100 });
    if (effectIntensity !== undefined) voiceModify['intensity'] = effectIntensity;

    const effectTimbre = parseInteger(model, flags.voiceEffectTimbre, 'voice-effect-timbre', { min: -100, max: 100 });
    if (effectTimbre !== undefined) voiceModify['timbre'] = effectTimbre;

    const soundEffects = parseEnumString(model, flags.soundEffects, 'sound-effects', T2A_SOUND_EFFECTS);
    if (soundEffects) voiceModify['sound_effects'] = soundEffects;

    if (Object.keys(voiceModify).length > 0) params['voice_modify'] = voiceModify;

    if (flags.subtitleEnable !== undefined) params['subtitle_enable'] = flags.subtitleEnable as boolean;
    if (flags.watermark !== undefined) params['aigc_watermark'] = flags.watermark as boolean;

    return buildEnvelope(model, params);
  },
});
