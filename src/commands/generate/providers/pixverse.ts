import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const TRANSITION_MODELS = [
  'pixverse_v35_transition',
  'pixverse_v4_transition',
  'pixverse_v45_transition',
  'pixverse_v5_transition',
  'pixverse_v5_5_transition',
  'pixverse_v5_6_transition',
  'pixverse_v6_transition',
] as const;

const I2V_MODELS = [
  'pixverse_v3_5_i2v',
  'pixverse_v4_i2v',
  'pixverse_v4_5_i2v',
  'pixverse_v5_i2v',
  'pixverse_v5_5_i2v',
  'pixverse_v5_6_i2v',
  'pixverse_v6_i2v',
] as const;

const T2V_MODELS = [
  'pixverse_v3_5_t2v',
  'pixverse_v4_t2v',
  'pixverse_v4_5_t2v',
  'pixverse_v5_t2v',
  'pixverse_v5_5_t2v',
  'pixverse_v5_6_t2v',
  'pixverse_v6_t2v',
] as const;

const FUSION_MODELS = [
  'pixverse_v5_6_fusion',
] as const;

const OPTIONAL_PROMPT_MODELS = new Set<string>([
  'pixverse_v35_transition',
  'pixverse_v3_5_t2v',
  'pixverse_v3_5_i2v',
  'pixverse_v4_i2v',
  'pixverse_v4_5_i2v',
  'pixverse_v5_i2v',
  'pixverse_v5_transition',
  'pixverse_v45_transition',
  'pixverse_v5_6_i2v',
  'pixverse_v6_transition',
]);

const LEGACY_T2V_MODELS = new Set<string>([
  'pixverse_v3_5_t2v',
  'pixverse_v4_t2v',
  'pixverse_v4_5_t2v',
  'pixverse_v5_t2v',
]);

const LEGACY_I2V_MODELS = new Set<string>([
  'pixverse_v3_5_i2v',
  'pixverse_v4_i2v',
  'pixverse_v4_5_i2v',
  'pixverse_v5_i2v',
]);

const LEGACY_TRANSITION_MODELS = new Set<string>([
  'pixverse_v35_transition',
  'pixverse_v4_transition',
  'pixverse_v45_transition',
  'pixverse_v5_transition',
]);

const V55_T2V_MODELS = new Set<string>(['pixverse_v5_5_t2v']);
const V55_I2V_MODELS = new Set<string>(['pixverse_v5_5_i2v']);
const V55_TRANSITION_MODELS = new Set<string>(['pixverse_v5_5_transition']);
const V56_T2V_MODELS = new Set<string>(['pixverse_v5_6_t2v']);
const V56_I2V_MODELS = new Set<string>(['pixverse_v5_6_i2v']);
const V56_TRANSITION_MODELS = new Set<string>(['pixverse_v5_6_transition']);
const V6_T2V_MODELS = new Set<string>(['pixverse_v6_t2v']);
const V6_I2V_MODELS = new Set<string>(['pixverse_v6_i2v']);
const V6_TRANSITION_MODELS = new Set<string>(['pixverse_v6_transition']);

const QUALITYS = new Set(['360p', '540p', '720p', '1080p']);
const LEGACY_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4']);
const V6_RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16', '2:3', '3:2', '21:9']);
const STYLES = new Set(['anime', '3d_animation', 'clay', 'comic', 'cyberpunk']);
const MOTION_MODES = new Set(['normal', 'fast']);
const CAMERA_MOVEMENTS = new Set(['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down']);
const THINKING_TYPES = new Set(['enabled', 'disabled', 'auto']);
const REFERENCE_TYPES = new Set(['subject', 'background']);

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function promptContainsReference(prompt: string, refName: string): boolean {
  const pattern = new RegExp(
    `(^|\\s)@${escapeRegex(refName)}(?=$|\\s|[\\p{P}\\p{S}])`,
    'u',
  );
  return pattern.test(prompt);
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

function parseNonEmptyString(model: string, value: unknown, flagName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a non-empty string.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function assertUnsupported(model: string, value: unknown, flagName: string, hint?: string): void {
  if (value === undefined) return;
  throw new CLIError(
    hint ?? `Model "${model}" does not support --${flagName}.`,
    ExitCode.USAGE,
  );
}

function assertPixVerseCommonUnsupported(model: string, flags: GlobalFlags): void {
  const entries: Array<[string, unknown]> = [
    ['short', flags.short],
    ['size', flags.size],
    ['fps', flags.fps],
    ['frames', flags.frames],
    ['service-tier', flags.serviceTier],
    ['expires-after', flags.expiresAfter],
    ['payload', flags.payload],
    ['callback-url', flags.callbackUrl],
    ['off-peak', flags.offPeak],
    ['recommend-prompt', flags.recommendPrompt],
    ['enhance-prompt', flags.enhancePrompt],
    ['template', flags.template],
    ['template-params', flags.templateParams],
    ['language', flags.language],
    ['creative', flags.creative],
    ['add-subtitle', flags.addSubtitle],
    ['remove-audio', flags.removeAudio],
    ['watermark', flags.watermark],
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
    ['draft-task-id', flags.draftTaskId],
    ['reference-urls', flags.referenceUrls],
    ['video-url', flags.videoUrl],
    ['video-id', flags.videoId],
    ['mask-urls', flags.maskUrls],
    ['movement-amplitude', flags.movementAmplitude],
    ['mode', flags.mode],
    ['shot-type', flags.shotType],
    ['cfg-scale', flags.cfgScale],
    ['video-quality', flags.videoQuality],
    ['pe-fast-mode', flags.peFastMode],
    ['audio-id', flags.audioId],
    ['voice-language', flags.voiceLanguage],
    ['voice-speed', flags.voiceSpeed],
    ['bgm', flags.bgm],
    ['sound', flags.sound],
    ['audio-url', flags.audioUrl],
    ['sounds', flags.sounds],
    ['bitrate', flags.bitrate],
    ['extension-type', flags.extensionType],
    ['character-reference-url', flags.characterReferenceUrl],
    ['style-reference-url', flags.styleReferenceUrl],
    ['character-reference-weight', flags.characterReferenceWeight],
    ['style-reference-weight', flags.styleReferenceWeight],
  ];

  for (const [flagName, value] of entries) {
    assertUnsupported(model, value, flagName);
  }
}

function collectImages(flags: GlobalFlags): string[] {
  const images = maybeStringArray(flags.imageUrls);
  const imageUrl = maybeString(flags.imageUrl);
  return imageUrl ? [imageUrl, ...images] : images;
}

function requireImageInputs(model: string, flags: GlobalFlags): string[] {
  const images = collectImages(flags);
  if (images.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --image-url or --image-urls.`,
      ExitCode.USAGE,
    );
  }
  return images;
}

function requireStartEndImages(model: string, flags: GlobalFlags): { first: string; last: string } {
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  const first = maybeString(flags.imageUrl);
  const last = maybeString(flags.imageTailUrl);
  if (!first || !last) {
    throw new CLIError(
      `Model "${model}" requires both --image-url and --image-tail-url.`,
      ExitCode.USAGE,
    );
  }
  return { first, last };
}

function assertDurationInSet(model: string, duration: number | undefined, allowed: number[]): void {
  if (duration === undefined) return;
  if (!allowed.includes(duration)) {
    throw new CLIError(
      `Model "${model}" requires --duration to be one of: ${allowed.join(', ')}.`,
      ExitCode.USAGE,
    );
  }
}

function assertDurationRange(model: string, duration: number | undefined, min: number, max: number): void {
  if (duration === undefined) return;
  if (duration < min || duration > max) {
    throw new CLIError(
      `Model "${model}" requires --duration to be between ${min} and ${max}.`,
      ExitCode.USAGE,
    );
  }
}

function validate1080pDuration(model: string, quality: string | undefined, duration: number | undefined): void {
  if (quality === '1080p' && duration === 10) {
    throw new CLIError(
      `Model "${model}" does not support --duration 10 with --resolution 1080p.`,
      ExitCode.USAGE,
    );
  }
}

function assertNoFusionFlags(model: string, flags: GlobalFlags): void {
  assertUnsupported(model, flags.referenceNames, 'reference-names');
  assertUnsupported(model, flags.referenceTypes, 'reference-types');
}

function validateLegacyControls(
  model: string,
  flags: GlobalFlags,
  options: { allowAspectRatio?: boolean; allowAudioControls?: boolean } = {},
): void {
  if (options.allowAspectRatio) {
    parseEnum(model, flags.aspectRatio, 'aspect-ratio', LEGACY_RATIOS);
  } else {
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
  }

  parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  parseEnum(model, flags.motionMode, 'motion-mode', MOTION_MODES);
  parseEnum(model, flags.cameraMovement, 'camera-movement', CAMERA_MOVEMENTS);
  parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  parseInteger(model, flags.templateId, 'template-id', { min: 0 });

  if (options.allowAudioControls) {
    if (flags.soundEffect !== undefined) {
      if (flags.soundEffect !== true) {
        throw new CLIError(
          `Model "${model}" only accepts --sound-effect as a boolean flag.`,
          ExitCode.USAGE,
        );
      }
    }
    parseNonEmptyString(model, flags.soundEffectPrompt, 'sound-effect-prompt');
    if (flags.soundEffectPrompt !== undefined && flags.soundEffect !== true) {
      throw new CLIError(
        `Model "${model}" requires --sound-effect when using --sound-effect-prompt.`,
        ExitCode.USAGE,
      );
    }

    if (flags.lipSync !== undefined) {
      if (flags.lipSync !== true) {
        throw new CLIError(
          `Model "${model}" only accepts --lip-sync as a boolean flag.`,
          ExitCode.USAGE,
        );
      }
    }
    parseNonEmptyString(model, flags.ttsText, 'tts-text');
    parseNonEmptyString(model, flags.voiceId, 'voice-id');
    if ((flags.ttsText !== undefined || flags.voiceId !== undefined) && flags.lipSync !== true) {
      throw new CLIError(
        `Model "${model}" requires --lip-sync when using --tts-text or --voice-id.`,
        ExitCode.USAGE,
      );
    }
    if (flags.lipSync === true && flags.ttsText === undefined) {
      throw new CLIError(
        `Model "${model}" requires --tts-text when using --lip-sync.`,
        ExitCode.USAGE,
      );
    }
    assertUnsupported(model, flags.audio, 'audio');
  } else {
    assertUnsupported(model, flags.soundEffect, 'sound-effect');
    assertUnsupported(model, flags.soundEffectPrompt, 'sound-effect-prompt');
    assertUnsupported(model, flags.lipSync, 'lip-sync');
    assertUnsupported(model, flags.ttsText, 'tts-text');
    assertUnsupported(model, flags.voiceId, 'voice-id');
    assertUnsupported(model, flags.audio, 'audio');
  }

  assertUnsupported(model, flags.style, 'style');
  assertUnsupported(model, flags.multiShot, 'multi-shot');
  assertUnsupported(model, flags.thinkingType, 'thinking-type');
}

function parsePixVerseAudioFlag(model: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value !== true) {
    throw new CLIError(
      `Model "${model}" only accepts --audio as a boolean flag.`,
      ExitCode.USAGE,
    );
  }
  return true;
}

function parsePixVerseMultiShotFlag(model: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value !== true) {
    throw new CLIError(
      `Model "${model}" only accepts --multi-shot as a boolean flag.`,
      ExitCode.USAGE,
    );
  }
  return true;
}

function applyPromptlessAudioControls(model: string, params: Record<string, unknown>, flags: GlobalFlags): void {
  assertUnsupported(model, flags.soundEffect, 'sound-effect');
  const soundEffectPrompt = parseNonEmptyString(model, flags.soundEffectPrompt, 'sound-effect-prompt');
  if (soundEffectPrompt) params['sound_effect_content'] = soundEffectPrompt;

  assertUnsupported(model, flags.lipSync, 'lip-sync');
  const ttsText = parseNonEmptyString(model, flags.ttsText, 'tts-text');
  if (ttsText) params['lip_sync_tts_content'] = ttsText;
  const voiceId = parseNonEmptyString(model, flags.voiceId, 'voice-id');
  if (voiceId && !ttsText) {
    throw new CLIError(
      `Model "${model}" requires --tts-text when using --voice-id.`,
      ExitCode.USAGE,
    );
  }
  if (voiceId) params['lip_sync_tts_speaker_id'] = voiceId;
}

function applyModernAudioControls(
  model: string,
  params: Record<string, unknown>,
  flags: GlobalFlags,
  options: { allowSoundSwitch: boolean; allowLipSyncSwitch: boolean; allowAudio: boolean; allowThinking: boolean; allowMultiShot: boolean },
): void {
  if (options.allowSoundSwitch) {
    if (flags.soundEffect !== undefined) {
      if (flags.soundEffect !== true) {
        throw new CLIError(
          `Model "${model}" only accepts --sound-effect as a boolean flag.`,
          ExitCode.USAGE,
        );
      }
      params['sound_effect_switch'] = true;
    }
    const soundEffectPrompt = parseNonEmptyString(model, flags.soundEffectPrompt, 'sound-effect-prompt');
    if (soundEffectPrompt) {
      if (flags.soundEffect !== true) {
        throw new CLIError(
          `Model "${model}" requires --sound-effect when using --sound-effect-prompt.`,
          ExitCode.USAGE,
        );
      }
      params['sound_effect_content'] = soundEffectPrompt;
    }
  } else {
    assertUnsupported(model, flags.soundEffect, 'sound-effect');
    applyPromptlessAudioControls(model, params, { ...flags, lipSync: flags.lipSync, ttsText: flags.ttsText, voiceId: flags.voiceId, soundEffectPrompt: flags.soundEffectPrompt });
  }

  if (options.allowLipSyncSwitch) {
    if (flags.lipSync !== undefined) {
      if (flags.lipSync !== true) {
        throw new CLIError(
          `Model "${model}" only accepts --lip-sync as a boolean flag.`,
          ExitCode.USAGE,
        );
      }
      params['lip_sync_switch'] = true;
    }
    const ttsText = parseNonEmptyString(model, flags.ttsText, 'tts-text');
    const voiceId = parseNonEmptyString(model, flags.voiceId, 'voice-id');
    if ((ttsText !== undefined || voiceId !== undefined) && flags.lipSync !== true) {
      throw new CLIError(
        `Model "${model}" requires --lip-sync when using --tts-text or --voice-id.`,
        ExitCode.USAGE,
      );
    }
    if (flags.lipSync === true && ttsText === undefined) {
      throw new CLIError(
        `Model "${model}" requires --tts-text when using --lip-sync.`,
        ExitCode.USAGE,
      );
    }
    if (ttsText) params['lip_sync_tts_content'] = ttsText;
    if (voiceId) params['lip_sync_tts_speaker_id'] = voiceId;
  } else {
    assertUnsupported(model, flags.lipSync, 'lip-sync');
    const ttsText = parseNonEmptyString(model, flags.ttsText, 'tts-text');
    const voiceId = parseNonEmptyString(model, flags.voiceId, 'voice-id');
    if (voiceId && !ttsText) {
      throw new CLIError(
        `Model "${model}" requires --tts-text when using --voice-id.`,
        ExitCode.USAGE,
      );
    }
    if (ttsText) params['lip_sync_tts_content'] = ttsText;
    if (voiceId) params['lip_sync_tts_speaker_id'] = voiceId;
  }

  if (options.allowAudio) {
    const audio = parsePixVerseAudioFlag(model, flags.audio);
    if (audio !== undefined) params['generate_audio_switch'] = audio;
  } else {
    assertUnsupported(model, flags.audio, 'audio');
  }

  if (options.allowMultiShot) {
    const multiShot = parsePixVerseMultiShotFlag(model, flags.multiShot);
    if (multiShot !== undefined) params['generate_multi_clip_switch'] = multiShot;
  } else {
    assertUnsupported(model, flags.multiShot, 'multi-shot');
  }

  if (options.allowThinking) {
    const thinkingType = parseEnum(model, flags.thinkingType, 'thinking-type', THINKING_TYPES);
    if (thinkingType) params['thinking_type'] = thinkingType;
  } else {
    assertUnsupported(model, flags.thinkingType, 'thinking-type');
  }
}

function buildLegacyTransitionBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  const { first, last } = requireStartEndImages(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');

  if (model === 'pixverse_v5_transition') {
    assertDurationInSet(model, duration, [5]);
  } else if (model === 'pixverse_v45_transition') {
    assertDurationInSet(model, duration, [5, 8]);
  } else {
    assertDurationInSet(model, duration, [5, 8]);
  }

  assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
  assertUnsupported(model, flags.templateId, 'template-id');
  validateLegacyControls(model, flags, { allowAudioControls: true });

  const params: Record<string, unknown> = {
    first_frame_image: first,
    last_frame_image: last,
  };
  if (prompt) params['prompt'] = prompt;
  if (duration !== undefined) params['duration'] = duration;
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  if (quality) params['quality'] = quality;
  const motionMode = parseEnum(model, flags.motionMode, 'motion-mode', MOTION_MODES);
  if (motionMode) params['motion_mode'] = motionMode;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  if (flags.soundEffect === true) params['sound_effect_switch'] = true;
  const soundEffectPrompt = parseNonEmptyString(model, flags.soundEffectPrompt, 'sound-effect-prompt');
  if (soundEffectPrompt) params['sound_effect_content'] = soundEffectPrompt;
  if (flags.lipSync === true) params['lip_sync_tts_switch'] = true;
  const ttsText = parseNonEmptyString(model, flags.ttsText, 'tts-text');
  if (ttsText) params['lip_sync_tts_content'] = ttsText;
  const voiceId = parseNonEmptyString(model, flags.voiceId, 'voice-id');
  if (voiceId) params['lip_sync_tts_speaker_id'] = voiceId;

  return buildEnvelope(model, params);
}

function buildLegacyI2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  const images = requireImageInputs(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8]);
  validateLegacyControls(model, flags, { allowAudioControls: true });

  const params: Record<string, unknown> = {
    img_id: images[0],
  };
  if (images.length > 1) params['img_ids'] = images;
  if (prompt) params['prompt'] = prompt;
  if (duration !== undefined) params['duration'] = duration;
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  if (quality) params['quality'] = quality;
  const motionMode = parseEnum(model, flags.motionMode, 'motion-mode', MOTION_MODES);
  if (motionMode) params['motion_mode'] = motionMode;
  const cameraMovement = parseEnum(model, flags.cameraMovement, 'camera-movement', CAMERA_MOVEMENTS);
  if (cameraMovement) params['camera_movement'] = cameraMovement;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;

  if (flags.soundEffect === true) params['sound_effect_switch'] = true;
  const soundEffectPrompt = parseNonEmptyString(model, flags.soundEffectPrompt, 'sound-effect-prompt');
  if (soundEffectPrompt) params['sound_effect_content'] = soundEffectPrompt;
  if (flags.lipSync === true) params['lip_sync_tts_switch'] = true;
  const ttsText = parseNonEmptyString(model, flags.ttsText, 'tts-text');
  if (ttsText) params['lip_sync_tts_content'] = ttsText;
  const voiceId = parseNonEmptyString(model, flags.voiceId, 'voice-id');
  if (voiceId) params['lip_sync_tts_speaker_id'] = voiceId;

  return buildEnvelope(model, params);
}

function buildLegacyT2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageUrl, 'image-url');
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8]);
  validateLegacyControls(model, flags, { allowAspectRatio: true });

  const params: Record<string, unknown> = {};
  if (prompt) params['prompt'] = prompt;
  const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', LEGACY_RATIOS);
  if (aspectRatio) params['aspect_ratio'] = aspectRatio;
  if (duration !== undefined) params['duration'] = duration;
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const motionMode = parseEnum(model, flags.motionMode, 'motion-mode', MOTION_MODES);
  if (motionMode) params['motion_mode'] = motionMode;
  const cameraMovement = parseEnum(model, flags.cameraMovement, 'camera-movement', CAMERA_MOVEMENTS);
  if (cameraMovement) params['camera_movement'] = cameraMovement;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;

  return buildEnvelope(model, params);
}

function buildV55T2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageUrl, 'image-url');
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');

  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);

  const params: Record<string, unknown> = { prompt };
  const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', LEGACY_RATIOS);
  if (aspectRatio) params['aspect_ratio'] = aspectRatio;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const style = parseEnum(model, flags.style, 'style', STYLES);
  if (style) params['style'] = style;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: false,
    allowLipSyncSwitch: false,
    allowAudio: true,
    allowThinking: true,
    allowMultiShot: true,
  });

  return buildEnvelope(model, params);
}

function buildV55I2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');

  const images = requireImageInputs(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);

  const params: Record<string, unknown> = {
    img_id: images[0],
  };
  if (images.length > 1) params['img_ids'] = images;
  params['prompt'] = prompt;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const style = parseEnum(model, flags.style, 'style', STYLES);
  if (style) params['style'] = style;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: false,
    allowLipSyncSwitch: false,
    allowAudio: true,
    allowThinking: true,
    allowMultiShot: true,
  });

  return buildEnvelope(model, params);
}

function buildV55TransitionBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
  assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
  assertUnsupported(model, flags.style, 'style');
  assertUnsupported(model, flags.templateId, 'template-id');
  assertUnsupported(model, flags.multiShot, 'multi-shot');
  assertUnsupported(model, flags.thinkingType, 'thinking-type');

  const { first, last } = requireStartEndImages(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);

  const params: Record<string, unknown> = {
    prompt,
    first_frame_image: first,
    last_frame_image: last,
  };
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: false,
    allowLipSyncSwitch: false,
    allowAudio: true,
    allowThinking: false,
    allowMultiShot: false,
  });

  return buildEnvelope(model, params);
}

function buildV56T2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageUrl, 'image-url');
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');

  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);

  const params: Record<string, unknown> = { prompt };
  const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', LEGACY_RATIOS);
  if (aspectRatio) params['aspect_ratio'] = aspectRatio;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;
  const style = parseEnum(model, flags.style, 'style', STYLES);
  if (style) params['style'] = style;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: true,
    allowLipSyncSwitch: true,
    allowAudio: true,
    allowThinking: true,
    allowMultiShot: false,
  });

  return buildEnvelope(model, params);
}

function buildV56I2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.multiShot, 'multi-shot');

  const images = requireImageInputs(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);

  const params: Record<string, unknown> = {
    img_id: images[0],
  };
  if (images.length > 1) params['img_ids'] = images;
  if (prompt) params['prompt'] = prompt;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;
  const style = parseEnum(model, flags.style, 'style', STYLES);
  if (style) params['style'] = style;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: true,
    allowLipSyncSwitch: true,
    allowAudio: true,
    allowThinking: true,
    allowMultiShot: false,
  });

  return buildEnvelope(model, params);
}

function buildV56TransitionBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
  assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
  assertUnsupported(model, flags.templateId, 'template-id');
  assertUnsupported(model, flags.style, 'style');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.multiShot, 'multi-shot');

  const { first, last } = requireStartEndImages(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);

  const params: Record<string, unknown> = {
    prompt,
    first_frame_img: first,
    last_frame_img: last,
  };
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: true,
    allowLipSyncSwitch: true,
    allowAudio: true,
    allowThinking: true,
    allowMultiShot: false,
  });

  return buildEnvelope(model, params);
}

function buildV6T2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageUrl, 'image-url');
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.thinkingType, 'thinking-type');

  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationRange(model, duration, 1, 15);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);

  const params: Record<string, unknown> = { prompt };
  const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', V6_RATIOS);
  if (aspectRatio) params['aspect_ratio'] = aspectRatio;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;
  const style = parseNonEmptyString(model, flags.style, 'style');
  if (style) params['style'] = style;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: true,
    allowLipSyncSwitch: true,
    allowAudio: true,
    allowThinking: false,
    allowMultiShot: true,
  });

  return buildEnvelope(model, params);
}

function buildV6I2VBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.aspectRatio, 'aspect-ratio', `Model "${model}" does not support --aspect-ratio; output ratio follows the input image.`);
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.thinkingType, 'thinking-type');

  const images = requireImageInputs(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationRange(model, duration, 1, 15);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);

  const params: Record<string, unknown> = {
    img_id: images[0],
  };
  if (images.length > 1) params['img_ids'] = images;
  params['prompt'] = prompt;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;
  const style = parseNonEmptyString(model, flags.style, 'style');
  if (style) params['style'] = style;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: false,
    allowLipSyncSwitch: false,
    allowAudio: true,
    allowThinking: false,
    allowMultiShot: true,
  });

  return buildEnvelope(model, params);
}

function buildV6TransitionBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertNoFusionFlags(model, flags);
  assertUnsupported(model, flags.imageUrls, 'image-urls');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.multiShot, 'multi-shot');
  assertUnsupported(model, flags.thinkingType, 'thinking-type');

  const { first, last } = requireStartEndImages(model, flags);
  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationRange(model, duration, 1, 15);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);

  const params: Record<string, unknown> = {
    first_frame_img: first,
    last_frame_img: last,
  };
  if (prompt) params['prompt'] = prompt;
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const negativePrompt = maybeString(flags.negativePrompt);
  if (negativePrompt) params['negative_prompt'] = negativePrompt;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const templateId = parseInteger(model, flags.templateId, 'template-id', { min: 0 });
  if (templateId !== undefined) params['template_id'] = templateId;
  const style = parseNonEmptyString(model, flags.style, 'style');
  if (style) params['style'] = style;

  applyModernAudioControls(model, params, flags, {
    allowSoundSwitch: true,
    allowLipSyncSwitch: true,
    allowAudio: true,
    allowThinking: false,
    allowMultiShot: false,
  });

  return buildEnvelope(model, params);
}

function buildFusionBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  assertPixVerseCommonUnsupported(model, flags);
  assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
  assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
  assertUnsupported(model, flags.style, 'style');
  assertUnsupported(model, flags.templateId, 'template-id');
  assertUnsupported(model, flags.motionMode, 'motion-mode');
  assertUnsupported(model, flags.cameraMovement, 'camera-movement');
  assertUnsupported(model, flags.soundEffect, 'sound-effect');
  assertUnsupported(model, flags.soundEffectPrompt, 'sound-effect-prompt');
  assertUnsupported(model, flags.lipSync, 'lip-sync');
  assertUnsupported(model, flags.ttsText, 'tts-text');
  assertUnsupported(model, flags.voiceId, 'voice-id');
  assertUnsupported(model, flags.multiShot, 'multi-shot');
  assertUnsupported(model, flags.thinkingType, 'thinking-type');

  const images = requireImageInputs(model, flags);
  if (images.length < 1 || images.length > 3) {
    throw new CLIError(
      `Model "${model}" requires 1-3 images via --image-url/--image-urls.`,
      ExitCode.USAGE,
    );
  }

  const names = maybeStringArray(flags.referenceNames);
  const types = maybeStringArray(flags.referenceTypes);
  if (names.length !== images.length) {
    throw new CLIError(
      `Model "${model}" requires --reference-names to match the number of input images.`,
      ExitCode.USAGE,
    );
  }
  if (types.length !== images.length) {
    throw new CLIError(
      `Model "${model}" requires --reference-types to match the number of input images.`,
      ExitCode.USAGE,
    );
  }

  const duration = parseInteger(model, flags.duration, 'duration');
  assertDurationInSet(model, duration, [5, 8, 10]);
  const quality = parseEnum(model, flags.resolution, 'resolution', QUALITYS);
  validate1080pDuration(model, quality, duration);
  const aspectRatio = parseEnum(model, flags.aspectRatio, 'aspect-ratio', LEGACY_RATIOS);
  if (!aspectRatio) {
    throw new CLIError(
      `Model "${model}" requires --aspect-ratio.`,
      ExitCode.USAGE,
    );
  }

  const imageReferences = images.map((imageUrl, index) => {
    const type = parseEnum(model, types[index], 'reference-types', REFERENCE_TYPES)!;
    const refName = parseNonEmptyString(model, names[index], 'reference-names')!;
    if (!promptContainsReference(prompt, refName)) {
      throw new CLIError(
        `Model "${model}" requires prompt references like @${refName} for every --reference-names value.`,
        ExitCode.USAGE,
      );
    }
    return {
      type,
      image_url: imageUrl,
      ref_name: refName,
    };
  });

  const params: Record<string, unknown> = {
    image_references: imageReferences,
    prompt,
    model: 'v5.6',
    aspect_ratio: aspectRatio,
  };
  if (duration !== undefined) params['duration'] = duration;
  if (quality) params['quality'] = quality;
  const seed = parseInteger(model, flags.seed, 'seed', { min: 0, max: 2147483647 });
  if (seed !== undefined) params['seed'] = seed;
  const audio = parsePixVerseAudioFlag(model, flags.audio);
  if (audio !== undefined) params['generate_audio_switch'] = audio;

  return buildEnvelope(model, params);
}

registerProvider({
  provider: 'pixverse',
  category: 'video',
  models: [...TRANSITION_MODELS, ...I2V_MODELS, ...T2V_MODELS, ...FUSION_MODELS],
  requiresPrompt(model: string): boolean {
    return !OPTIONAL_PROMPT_MODELS.has(model);
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (LEGACY_TRANSITION_MODELS.has(model)) return buildLegacyTransitionBody(model, prompt, flags);
    if (LEGACY_I2V_MODELS.has(model)) return buildLegacyI2VBody(model, prompt, flags);
    if (LEGACY_T2V_MODELS.has(model)) return buildLegacyT2VBody(model, prompt, flags);
    if (V55_T2V_MODELS.has(model)) return buildV55T2VBody(model, prompt, flags);
    if (V55_I2V_MODELS.has(model)) return buildV55I2VBody(model, prompt, flags);
    if (V55_TRANSITION_MODELS.has(model)) return buildV55TransitionBody(model, prompt, flags);
    if (V56_T2V_MODELS.has(model)) return buildV56T2VBody(model, prompt, flags);
    if (V56_I2V_MODELS.has(model)) return buildV56I2VBody(model, prompt, flags);
    if (V56_TRANSITION_MODELS.has(model)) return buildV56TransitionBody(model, prompt, flags);
    if (V6_T2V_MODELS.has(model)) return buildV6T2VBody(model, prompt, flags);
    if (V6_I2V_MODELS.has(model)) return buildV6I2VBody(model, prompt, flags);
    if (V6_TRANSITION_MODELS.has(model)) return buildV6TransitionBody(model, prompt, flags);
    if (FUSION_MODELS.includes(model as typeof FUSION_MODELS[number])) return buildFusionBody(model, prompt, flags);

    throw new CLIError(
      `Unsupported PixVerse model "${model}".`,
      ExitCode.USAGE,
    );
  },
});
