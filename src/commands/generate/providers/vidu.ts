import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const Q1_T2V_MODELS = ['vidu_q1'] as const;
const Q2_T2V_MODELS = ['vidu_q2'] as const;
const Q3_T2V_MODELS = ['vidu_q3_pro', 'vidu_q3_turbo'] as const;
const Q1_I2V_MODELS = ['vidu_q1_i2v'] as const;
const V20_I2V_MODELS = ['vidu_20_i2v'] as const;
const Q3_I2V_MODELS = ['vidu_q3_pro_i2v', 'vidu_q3_turbo_i2v'] as const;
const START_END_MODELS = ['vidu_q3_pro_start_end', 'vidu_q3_turbo_start_end'] as const;
const REFERENCE_MODELS = ['vidu_q3_reference'] as const;
const MIX_REFERENCE_MODELS = ['vidu_q3_mix_reference'] as const;
const TEMPLATE_MODELS = ['vidu_template', 'vidu_template_v2'] as const;
const AD_ONE_CLICK_MODELS = ['vidu_ad_one_click'] as const;
const ONE_CLICK_MV_MODELS = ['vidu_one_click_mv'] as const;
const TRENDING_REPLICATE_MODELS = ['vidu_trending_replicate'] as const;

const TEMPLATE_NAMES = new Set([
  'turn_into_zombie',
  'head_to_balloon',
  'wednesdays_vibe',
  'covered_liquid_metal',
]);
const Q1_STYLES = new Set(['general', 'anime']);
const Q1_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1']);
const Q2_Q3_ASPECT_RATIOS = new Set(['16:9', '9:16', '3:4', '4:3', '1:1']);
const Q3_REFERENCE_ASPECT_RATIOS = new Set(['1:1', '9:16', '16:9', '3:4', '4:3', 'auto']);
const ONE_CLICK_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);
const AD_ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16']);
const MOVEMENT_AMPLITUDES = new Set(['auto', 'small', 'medium', 'large']);
const Q2_RESOLUTIONS = new Set(['540p', '720p', '1080p']);
const Q3_T2V_RESOLUTIONS = new Set(['360p', '540p', '720p', '1080p']);
const Q3_I2V_RESOLUTIONS = new Set(['360p', '540p', '720p', '1080p', '2K']);
const Q3_START_END_RESOLUTIONS = new Set(['540p', '720p', '1080p']);
const Q3_REFERENCE_RESOLUTIONS = new Set(['360p', '540p', '720p', '1080p']);
const Q3_MIX_RESOLUTIONS = new Set(['720p', '1080p']);
const V20_I2V_RESOLUTIONS = new Set(['360p', '720p', '1080p']);
const ONE_CLICK_RESOLUTIONS = new Set(['540p', '720p', '1080p']);
const AD_LANGUAGES = new Set(['zh', 'en']);

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

function maybeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
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
  options: { min?: number; max?: number } = {},
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
  if (options.max !== undefined && value > options.max) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be at most ${options.max}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseEnum(model: string, value: unknown, flagName: string, allowed: Set<string>): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be one of: ${Array.from(allowed).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return value;
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

function collectImages(flags: GlobalFlags): string[] {
  const images = maybeStringArray(flags.imageUrls);
  const imageUrl = maybeString(flags.imageUrl);
  return imageUrl ? [imageUrl, ...images] : images;
}

function collectImageSet(
  model: string,
  flags: GlobalFlags,
  options: { min: number; max: number; allowImageTail?: boolean } = { min: 1, max: 7 },
): string[] {
  if (!options.allowImageTail) {
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  }
  const images = collectImages(flags);
  if (images.length < options.min || images.length > options.max) {
    const expected = options.min === options.max ? `${options.min}` : `${options.min}-${options.max}`;
    throw new CLIError(
      `Model "${model}" requires ${expected} input image${options.max === 1 ? '' : 's'} via --image-url/--image-urls.`,
      ExitCode.USAGE,
    );
  }
  return images;
}

function requireSingleImage(model: string, flags: GlobalFlags): string[] {
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  return collectImageSet(model, flags, { min: 1, max: 1 });
}

function requireStartEndImages(model: string, flags: GlobalFlags): string[] {
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  const first = maybeString(flags.imageUrl);
  const last = maybeString(flags.imageTailUrl);
  if (!first || !last) {
    throw new CLIError(
      `Model "${model}" requires both --image-url and --image-tail-url.`,
      ExitCode.USAGE,
    );
  }
  return [first, last];
}

function requireVideoUrl(model: string, flags: GlobalFlags): string {
  const videoUrl = maybeString(flags.videoUrl);
  if (!videoUrl) {
    throw new CLIError(
      `Model "${model}" requires --video-url.`,
      ExitCode.USAGE,
    );
  }
  return videoUrl;
}

function rejectReservedSounds(model: string, flags: GlobalFlags): void {
  assertUnsupported(
    model,
    flags.sounds,
    'sounds',
    `Model "${model}" does not currently support --sounds; the upstream field is reserved.`,
  );
}

function applyViduCommonUnsupported(model: string, flags: GlobalFlags): void {
  assertUnsupported(model, flags.short, 'short');
  assertUnsupported(model, flags.size, 'size');
  assertUnsupported(model, flags.fps, 'fps');
  assertUnsupported(model, flags.frames, 'frames');
  assertUnsupported(model, flags.serviceTier, 'service-tier');
  assertUnsupported(model, flags.expiresAfter, 'expires-after');
  assertUnsupported(model, flags.externalTaskId, 'external-task-id');
  assertUnsupported(model, flags.elementIds, 'element-ids');
  assertUnsupported(model, flags.effectScene, 'effect-scene');
  assertUnsupported(model, flags.characterOrientation, 'character-orientation');
  assertUnsupported(model, flags.keepOriginalSound, 'keep-original-sound');
  assertUnsupported(model, flags.videoReferType, 'video-refer-type');
  assertUnsupported(model, flags.lipsyncMode, 'lipsync-mode');
  assertUnsupported(model, flags.cameraFixed, 'camera-fixed');
  assertUnsupported(model, flags.returnLastFrame, 'return-last-frame');
  assertUnsupported(model, flags.draft, 'draft');
  assertUnsupported(model, flags.referenceUrls, 'reference-urls');
  assertUnsupported(model, flags.videoId, 'video-id');
  assertUnsupported(model, flags.draftTaskId, 'draft-task-id');
  assertUnsupported(model, flags.maskUrls, 'mask-urls');
  assertUnsupported(model, flags.mode, 'mode');
  assertUnsupported(model, flags.shotType, 'shot-type');
  assertUnsupported(model, flags.multiShot, 'multi-shot');
  assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
  assertUnsupported(model, flags.cfgScale, 'cfg-scale');
  assertUnsupported(model, flags.videoQuality, 'video-quality');
  assertUnsupported(model, flags.peFastMode, 'pe-fast-mode');
  assertUnsupported(model, flags.audioId, 'audio-id');
  assertUnsupported(model, flags.voiceLanguage, 'voice-language');
  assertUnsupported(model, flags.voiceSpeed, 'voice-speed');
  assertUnsupported(model, flags.sound, 'sound');
  assertUnsupported(model, flags.bitrate, 'bitrate');
  assertUnsupported(model, flags.extensionType, 'extension-type');
  assertUnsupported(model, flags.templateId, 'template-id');
  assertUnsupported(model, flags.reqKey, 'req-key');
  assertUnsupported(model, flags.subReqKey, 'sub-req-key');
}

function applyViduBasicParams(
  model: string,
  flags: GlobalFlags,
  options: {
    duration?: { min?: number; max?: number; allowed?: number[] };
    resolution?: Set<string>;
    aspectRatio?: Set<string>;
    movementAmplitude?: boolean;
    bgm?: boolean;
    audio?: boolean;
    payload?: boolean;
    callbackUrl?: boolean;
    offPeak?: boolean;
    watermark?: boolean;
    watermarkUrl?: boolean;
    watermarkPosition?: boolean;
    metaData?: boolean;
    style?: Set<string>;
  },
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (options.duration) {
    const duration = parseInteger(model, flags.duration, 'duration', {
      min: options.duration.min,
      max: options.duration.max,
    });
    if (duration !== undefined) {
      if (options.duration.allowed && !options.duration.allowed.includes(duration)) {
        throw new CLIError(
          `Model "${model}" requires --duration to be one of: ${options.duration.allowed.join(', ')}.`,
          ExitCode.USAGE,
        );
      }
      params['duration'] = duration;
    }
  } else {
    assertUnsupported(model, flags.duration, 'duration');
  }

  if (options.resolution) {
    const resolution = parseEnum(model, flags.resolution, 'resolution', options.resolution);
    if (resolution) params['resolution'] = resolution;
  } else {
    assertUnsupported(model, flags.resolution, 'resolution');
  }

  if (flags.seed !== undefined) {
    const seed = parseInteger(model, flags.seed, 'seed');
    if (seed !== undefined) params['seed'] = seed;
  }

  if (options.aspectRatio) {
    const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', options.aspectRatio);
    if (aspectRatio) params['aspect_ratio'] = aspectRatio;
  } else {
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
  }

  if (options.movementAmplitude) {
    const movementAmplitude = parseEnum(model, flags.movementAmplitude, 'movement-amplitude', MOVEMENT_AMPLITUDES);
    if (movementAmplitude) params['movement_amplitude'] = movementAmplitude;
  } else {
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');
  }

  if (options.bgm) {
    if (flags.bgm !== undefined) params['bgm'] = flags.bgm as boolean;
  } else {
    assertUnsupported(model, flags.bgm, 'bgm');
  }

  if (options.audio) {
    if (flags.audio !== undefined) params['audio'] = flags.audio as boolean;
  } else {
    assertUnsupported(model, flags.audio, 'audio');
  }

  if (options.payload) {
    const payload = maybeString(flags.payload);
    if (payload) params['payload'] = payload;
  } else {
    assertUnsupported(model, flags.payload, 'payload');
  }

  if (options.callbackUrl) {
    const callbackUrl = maybeString(flags.callbackUrl);
    if (callbackUrl) params['callback_url'] = callbackUrl;
  } else {
    assertUnsupported(model, flags.callbackUrl, 'callback-url');
  }

  if (options.offPeak) {
    if (flags.offPeak !== undefined) params['off_peak'] = flags.offPeak as boolean;
  } else {
    assertUnsupported(model, flags.offPeak, 'off-peak');
  }

  if (options.watermark) {
    if (flags.watermark !== undefined) params['watermark'] = flags.watermark as boolean;
  } else {
    assertUnsupported(model, flags.watermark, 'watermark');
  }

  if (options.watermarkPosition) {
    const watermarkPosition = parseInteger(model, flags.watermarkPosition, 'watermark-position', { min: 1, max: 4 });
    if (watermarkPosition !== undefined) params['wm_position'] = watermarkPosition;
  } else {
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
  }

  if (options.watermarkUrl) {
    const watermarkUrl = maybeString(flags.watermarkUrl);
    if (watermarkUrl) params['wm_url'] = watermarkUrl;
  } else {
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
  }

  if (options.metaData) {
    const metaData = maybeString(flags.metaData);
    if (metaData) params['meta_data'] = metaData;
  } else {
    assertUnsupported(model, flags.metaData, 'meta-data');
  }

  if (options.style) {
    const style = parseEnum(model, flags.style, 'style', options.style);
    if (style) params['style'] = style;
  } else {
    assertUnsupported(model, flags.style, 'style');
  }

  return params;
}

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: Q1_T2V_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');

    const params = applyViduBasicParams(model, flags, {
      aspectRatio: Q1_ASPECT_RATIOS,
      movementAmplitude: true,
      bgm: true,
      payload: true,
      callbackUrl: true,
      style: Q1_STYLES,
    });
    params['prompt'] = prompt;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: Q2_T2V_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');

    const params = applyViduBasicParams(model, flags, {
      duration: { min: 1, max: 10 },
      resolution: Q2_RESOLUTIONS,
      aspectRatio: Q2_Q3_ASPECT_RATIOS,
      bgm: true,
      payload: true,
      callbackUrl: true,
      offPeak: true,
    });
    params['prompt'] = prompt;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: Q3_T2V_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    rejectReservedSounds(model, flags);
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');

    const params = applyViduBasicParams(model, flags, {
      duration: { min: 1, max: 16 },
      resolution: Q3_T2V_RESOLUTIONS,
      aspectRatio: Q2_Q3_ASPECT_RATIOS,
      movementAmplitude: true,
      bgm: true,
      audio: true,
      payload: true,
      callbackUrl: true,
      offPeak: true,
      watermark: true,
      watermarkPosition: true,
      watermarkUrl: true,
      metaData: true,
    });
    params['prompt'] = prompt;
    return buildEnvelope(model, params);
  },
});

function buildQ3I2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  applyViduCommonUnsupported(model, flags);
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  assertUnsupported(model, flags.videoUrl, 'video-url');
  rejectReservedSounds(model, flags);
  assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
  assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
  assertUnsupported(model, flags.template, 'template');
  assertUnsupported(model, flags.templateParams, 'template-params');
  assertUnsupported(model, flags.language, 'language');
  assertUnsupported(model, flags.creative, 'creative');
  assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
  assertUnsupported(model, flags.removeAudio, 'remove-audio');
  assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
  assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
  assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
  assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');

  const params = applyViduBasicParams(model, flags, {
    duration: { min: 1, max: 16 },
    resolution: Q3_I2V_RESOLUTIONS,
    movementAmplitude: true,
    bgm: true,
    audio: true,
    payload: true,
    callbackUrl: true,
    offPeak: true,
    watermark: true,
    watermarkPosition: true,
    watermarkUrl: true,
    metaData: true,
  });
  params['images'] = requireSingleImage(model, flags);

  if (prompt.length > 0) params['prompt'] = prompt;
  const audioUrl = maybeString(flags.audioUrl);
  if (audioUrl) params['audio_url'] = audioUrl;
  const voiceId = maybeString(flags.voiceId);
  if (voiceId) params['voice_id'] = voiceId;
  return buildEnvelope(model, params);
}

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: Q3_I2V_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody: buildQ3I2VBody,
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: Q1_I2V_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.offPeak, 'off-peak');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');
    if (flags.recommendPrompt && prompt.length > 0) {
      throw new CLIError(
        `Model "${model}" does not allow --prompt together with --recommend-prompt.`,
        ExitCode.USAGE,
      );
    }

    const params = applyViduBasicParams(model, flags, {
      duration: { allowed: [5] },
      movementAmplitude: true,
      bgm: true,
      payload: true,
      callbackUrl: true,
    });
    params['images'] = requireSingleImage(model, flags);
    if (prompt.length > 0) params['prompt'] = prompt;
    if (flags.recommendPrompt) params['is_rec'] = true;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: V20_I2V_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');

    const params = applyViduBasicParams(model, flags, {
      duration: { allowed: [4, 8] },
      resolution: V20_I2V_RESOLUTIONS,
      movementAmplitude: true,
      payload: true,
      callbackUrl: true,
      offPeak: true,
    });
    params['images'] = requireSingleImage(model, flags);
    if (prompt.length > 0) params['prompt'] = prompt;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: START_END_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.payload, 'payload');
    assertUnsupported(model, flags.callbackUrl, 'callback-url');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    if (model === 'vidu_q3_pro_start_end') {
      assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    } else if (flags.recommendPrompt && prompt.length > 0) {
      throw new CLIError(
        `Model "${model}" does not allow --prompt together with --recommend-prompt.`,
        ExitCode.USAGE,
      );
    }

    const params = applyViduBasicParams(model, flags, {
      duration: { min: 1, max: 16 },
      resolution: Q3_START_END_RESOLUTIONS,
      aspectRatio: Q2_Q3_ASPECT_RATIOS,
      bgm: true,
      audio: true,
      offPeak: true,
    });
    params['images'] = requireStartEndImages(model, flags);
    if (prompt.length > 0) params['prompt'] = prompt;
    if (flags.recommendPrompt) params['is_rec'] = true;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: REFERENCE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    rejectReservedSounds(model, flags);
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');

    const params = applyViduBasicParams(model, flags, {
      duration: { min: 3, max: 16 },
      resolution: Q3_REFERENCE_RESOLUTIONS,
      aspectRatio: Q3_REFERENCE_ASPECT_RATIOS,
      bgm: true,
      audio: true,
      payload: true,
      callbackUrl: true,
      offPeak: true,
      watermark: true,
      watermarkPosition: true,
      watermarkUrl: true,
      metaData: true,
    });
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');

    const images = collectImages(flags);
    if (images.length > 0) params['images'] = images;
    params['prompt'] = prompt;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: MIX_REFERENCE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    rejectReservedSounds(model, flags);
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');

    const params = applyViduBasicParams(model, flags, {
      duration: { min: 3, max: 16 },
      resolution: Q3_MIX_RESOLUTIONS,
      aspectRatio: Q3_REFERENCE_ASPECT_RATIOS,
      audio: true,
      payload: true,
      callbackUrl: true,
      offPeak: true,
      watermark: true,
      watermarkPosition: true,
      watermarkUrl: true,
      metaData: true,
    });

    const images = collectImages(flags);
    if (images.length > 7) {
      throw new CLIError(
        `Model "${model}" allows at most 7 reference images via --image-url/--image-urls.`,
        ExitCode.USAGE,
      );
    }
    if (images.length > 0) params['images'] = images;

    const firstFrameImage = maybeString(flags.imageUrl);
    if (firstFrameImage) params['first_frame_image'] = firstFrameImage;
    const lastFrameImage = maybeString(flags.imageTailUrl);
    if (lastFrameImage) params['last_frame_image'] = lastFrameImage;

    const characterReferenceUrl = maybeString(flags.characterReferenceUrl);
    if (characterReferenceUrl) params['character_reference_image'] = characterReferenceUrl;
    const styleReferenceUrl = maybeString(flags.styleReferenceUrl);
    if (styleReferenceUrl) params['style_reference_image'] = styleReferenceUrl;

    const characterReferenceWeight = parseNumber(model, flags.characterReferenceWeight, 'character-reference-weight', {
      min: 0,
      max: 1,
    });
    if (characterReferenceWeight !== undefined) {
      params['character_reference_weight'] = characterReferenceWeight;
    }

    const styleReferenceWeight = parseNumber(model, flags.styleReferenceWeight, 'style-reference-weight', {
      min: 0,
      max: 1,
    });
    if (styleReferenceWeight !== undefined) {
      params['style_reference_weight'] = styleReferenceWeight;
    }

    if (flags.enhancePrompt !== undefined) params['enhance_prompt'] = flags.enhancePrompt as boolean;
    params['prompt'] = prompt;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: TEMPLATE_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.duration, 'duration');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.resolution, 'resolution');
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.payload, 'payload');
    assertUnsupported(model, flags.callbackUrl, 'callback-url');
    assertUnsupported(model, flags.offPeak, 'off-peak');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.style, 'style');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');

    const template = parseEnum(model, flags.template, 'template', TEMPLATE_NAMES);
    if (!template) {
      throw new CLIError(
        `Model "${model}" requires --template.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = {
      template,
      images: collectImageSet(model, flags, { min: 1, max: 7 }),
    };
    if (prompt.length > 0) params['prompt'] = prompt;
    const seed = parseInteger(model, flags.seed, 'seed');
    if (seed !== undefined) params['seed'] = seed;
    if (flags.bgm !== undefined) params['bgm'] = flags.bgm as boolean;
    const templateParams = parseJsonObject(model, flags.templateParams, 'template-params');
    if (templateParams) params['extra_params'] = templateParams;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: AD_ONE_CLICK_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.seed, 'seed');
    assertUnsupported(model, flags.resolution, 'resolution');
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.bgm, 'bgm');
    assertUnsupported(model, flags.payload, 'payload');
    assertUnsupported(model, flags.callbackUrl, 'callback-url');
    assertUnsupported(model, flags.offPeak, 'off-peak');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.style, 'style');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');

    const params: Record<string, unknown> = {
      images: collectImageSet(model, flags, { min: 1, max: 7 }),
    };
    if (prompt.length > 0) params['prompt'] = prompt;
    const duration = parseInteger(model, flags.duration, 'duration', { min: 8, max: 60 });
    if (duration !== undefined) params['duration'] = duration;
    const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', AD_ASPECT_RATIOS);
    if (aspectRatio) params['aspect_ratio'] = aspectRatio;
    const language = parseEnum(model, flags.language, 'language', AD_LANGUAGES);
    if (language) params['language'] = language;
    if (flags.creative !== undefined) params['creative'] = flags.creative as boolean;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: ONE_CLICK_MV_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.duration, 'duration');
    assertUnsupported(model, flags.seed, 'seed');
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.bgm, 'bgm');
    assertUnsupported(model, flags.payload, 'payload');
    assertUnsupported(model, flags.callbackUrl, 'callback-url');
    assertUnsupported(model, flags.offPeak, 'off-peak');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.style, 'style');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.removeAudio, 'remove-audio');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');

    const audioUrl = maybeString(flags.audioUrl);
    if (!audioUrl) {
      throw new CLIError(
        `Model "${model}" requires --audio-url.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = {
      images: collectImageSet(model, flags, { min: 1, max: 7 }),
      audio_url: audioUrl,
    };
    if (prompt.length > 0) params['prompt'] = prompt;
    const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', ONE_CLICK_ASPECT_RATIOS);
    if (aspectRatio) params['aspect_ratio'] = aspectRatio;
    const resolution = parseEnum(model, flags.resolution, 'resolution', ONE_CLICK_RESOLUTIONS);
    if (resolution) params['resolution'] = resolution;
    if (flags.addSubtitle !== undefined) params['add_subtitle'] = flags.addSubtitle as boolean;
    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'vidu',
  category: 'video',
  models: TRENDING_REPLICATE_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    applyViduCommonUnsupported(model, flags);
    assertUnsupported(model, flags.duration, 'duration');
    assertUnsupported(model, flags.seed, 'seed');
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.bgm, 'bgm');
    assertUnsupported(model, flags.payload, 'payload');
    assertUnsupported(model, flags.callbackUrl, 'callback-url');
    assertUnsupported(model, flags.offPeak, 'off-peak');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupported(model, flags.watermarkPosition, 'watermark-position');
    assertUnsupported(model, flags.watermarkUrl, 'watermark-url');
    assertUnsupported(model, flags.metaData, 'meta-data');
    assertUnsupported(model, flags.enhancePrompt, 'enhance-prompt');
    assertUnsupported(model, flags.style, 'style');
    assertUnsupported(model, flags.template, 'template');
    assertUnsupported(model, flags.templateParams, 'template-params');
    assertUnsupported(model, flags.language, 'language');
    assertUnsupported(model, flags.creative, 'creative');
    assertUnsupported(model, flags.addSubtitle, 'add-subtitle');
    assertUnsupported(model, flags.characterReferenceUrl, 'character-reference-url');
    assertUnsupported(model, flags.styleReferenceUrl, 'style-reference-url');
    assertUnsupported(model, flags.characterReferenceWeight, 'character-reference-weight');
    assertUnsupported(model, flags.styleReferenceWeight, 'style-reference-weight');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.recommendPrompt, 'recommend-prompt');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');

    const params: Record<string, unknown> = {
      video_url: requireVideoUrl(model, flags),
      images: collectImageSet(model, flags, { min: 1, max: 7 }),
    };
    if (prompt.length > 0) params['prompt'] = prompt;
    const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', ONE_CLICK_ASPECT_RATIOS);
    if (aspectRatio) params['aspect_ratio'] = aspectRatio;
    const resolution = parseEnum(model, flags.resolution, 'resolution', ONE_CLICK_RESOLUTIONS);
    if (resolution) params['resolution'] = resolution;
    if (flags.removeAudio !== undefined) params['remove_audio'] = flags.removeAudio as boolean;
    return buildEnvelope(model, params);
  },
});
