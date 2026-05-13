import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

// ── Model lists ──────────────────────────────────────────────────────────────

const T2V_MODELS = [
  'kling_v1',
  'kling_v1_5',
  'kling_v1_6',
  'kling_v2_master',
  'kling_v2_1_master',
  'kling_v2_5_turbo',
  'kling_v2_6',
  'kling_v3',
] as const;

const I2V_MODELS = [
  'kling_v1_i2v',
  'kling_v1_5_i2v',
  'kling_v1_6_i2v',
  'kling_v2_1_i2v',
  'kling_v2_master_i2v',
  'kling_v2_1_master_i2v',
  'kling_v2_5_turbo_i2v',
  'kling_v2_6_i2v',
  'kling_v3_i2v',
] as const;

const IMAGE_V3_MODELS = [
  'kling_v3_image',
] as const;

const OMNI_IMAGE_MODELS = [
  'kling_omni_image',
  'kling_v3_omni_image',
] as const;

const AVATAR_MODELS = [
  'kling_avatar',
] as const;

const EFFECTS_SINGLE_MODELS = [
  'kling_effects_single',
] as const;

const EFFECTS_MULTI_MODELS = [
  'kling_effects_multi_v1',
  'kling_effects_multi_v15',
  'kling_effects_multi_v16',
] as const;

const MOTION_CONTROL_MODELS = [
  'kling_motion_control',
  'kling_v3_motion_control',
] as const;

const DURATION_EXTENSION_MODELS = [
  'kling_duration_extension',
] as const;

const LIPSYNC_MODELS = [
  'kling_lipsync',
] as const;

const OMNI_VIDEO_MODELS = [
  'kling_omni_video',
  'kling_v3_omni_video',
] as const;

const VIDEO_TO_AUDIO_MODELS = [
  'kling_video_to_audio',
] as const;

const TENCENT_KLING_I2V_MODELS = [
  'tencent_kling_v3',
] as const;

const TENCENT_KLING_OMNI_VIDEO_MODELS = [
  'tencent_kling_v3_omni',
] as const;

const T2V_SET = new Set<string>(T2V_MODELS);
const VIDEO_REFER_TYPES = new Set(['feature', 'base']);

function buildEnvelope(model: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    dash_scope: true,
    moderation: true,
    input: [{ params }],
    metadata: {},
  };
}

function requireStringFlag(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CLIError(message, ExitCode.USAGE);
  }
  return value;
}

function requireNumberFlag(value: unknown, message: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new CLIError(message, ExitCode.USAGE);
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

function maybeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function collectImageInputs(flags: GlobalFlags): string[] {
  const images = maybeStringArray(flags.imageUrls);
  if (typeof flags.imageUrl === 'string' && flags.imageUrl.length > 0) {
    return [flags.imageUrl, ...images];
  }
  return images;
}

function collectElementIds(flags: GlobalFlags): string[] {
  return maybeStringArray(flags.elementIds);
}

function buildElementList(flags: GlobalFlags): Array<Record<string, unknown>> {
  return collectElementIds(flags).map((elementId) => ({ element_id: elementId }));
}

function requireVideoSource(
  model: string,
  flags: GlobalFlags,
  options: { allowBoth?: boolean } = {},
): { key: 'video_id' | 'video_url'; value: string } {
  const videoId = typeof flags.videoId === 'string' && flags.videoId.length > 0 ? flags.videoId : undefined;
  const videoUrl = typeof flags.videoUrl === 'string' && flags.videoUrl.length > 0 ? flags.videoUrl : undefined;

  if (!options.allowBoth && videoId && videoUrl) {
    throw new CLIError(
      `Model "${model}" accepts either --video-id or --video-url, not both.`,
      ExitCode.USAGE,
    );
  }
  if (videoId) return { key: 'video_id', value: videoId };
  if (videoUrl) return { key: 'video_url', value: videoUrl };

  throw new CLIError(
    `Model "${model}" requires --video-id or --video-url.`,
    ExitCode.USAGE,
  );
}

function buildOmniImageList(flags: GlobalFlags): Array<Record<string, unknown>> {
  return collectImageInputs(flags).map((image) => ({ image }));
}

function buildOmniVideoImageList(model: string, flags: GlobalFlags): Array<Record<string, unknown>> {
  const imageUrl = typeof flags.imageUrl === 'string' && flags.imageUrl.length > 0 ? flags.imageUrl : undefined;
  const imageTailUrl = typeof flags.imageTailUrl === 'string' && flags.imageTailUrl.length > 0 ? flags.imageTailUrl : undefined;
  const imageUrls = maybeStringArray(flags.imageUrls);

  if (imageTailUrl && !imageUrl) {
    throw new CLIError(
      `Model "${model}" requires --image-url when using --image-tail-url.`,
      ExitCode.USAGE,
    );
  }
  if (imageTailUrl && imageUrls.length > 0) {
    throw new CLIError(
      `Model "${model}" does not allow --image-tail-url together with additional --image-urls.`,
      ExitCode.USAGE,
    );
  }

  const list: Array<Record<string, unknown>> = [];
  if (imageUrl) list.push({ image_url: imageUrl, type: 'first_frame' });
  if (imageTailUrl) list.push({ image_url: imageTailUrl, type: 'end_frame' });
  for (const image of imageUrls) list.push({ image_url: image });
  return list;
}

function applyCommonParams(params: Record<string, unknown>, flags: GlobalFlags): void {
  if (flags.duration !== undefined) params['duration'] = String(flags.duration);
  if (flags.aspectRatio) params['aspect_ratio'] = flags.aspectRatio as string;
  if (flags.mode) params['mode'] = flags.mode as string;
  if (flags.negativePrompt) params['negative_prompt'] = flags.negativePrompt as string;
  if (flags.cfgScale !== undefined) params['cfg_scale'] = flags.cfgScale as number;
  if (flags.sound) params['sound'] = flags.sound as string;
  if (flags.multiShot !== undefined) params['multi_shot'] = flags.multiShot as boolean;
  if (flags.shotType) params['shot_type'] = flags.shotType as string;
  if (flags.watermark !== undefined) {
    params['watermark_info'] = { enabled: flags.watermark as boolean };
  }
  if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;
}

function buildOmniVideoParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const imageList = buildOmniVideoImageList(model, flags);
  const elementList = buildElementList(flags);
  const hasTypedFrameImages = typeof flags.imageUrl === 'string' || typeof flags.imageTailUrl === 'string';
  const videoUrl = typeof flags.videoUrl === 'string' && flags.videoUrl.length > 0 ? flags.videoUrl : undefined;
  const videoReferType = parseEnum(model, flags.videoReferType, 'video-refer-type', VIDEO_REFER_TYPES) ?? 'base';

  if (videoUrl && videoReferType !== 'feature' && hasTypedFrameImages) {
    throw new CLIError(
      `Model "${model}" does not allow --image-url/--image-tail-url when --video-refer-type is base.`,
      ExitCode.USAGE,
    );
  }
  if (!videoUrl && !hasTypedFrameImages && !flags.aspectRatio) {
    throw new CLIError(
      `Model "${model}" requires --aspect-ratio when no first-frame image or base video input is provided.`,
      ExitCode.USAGE,
    );
  }

  const params: Record<string, unknown> = { prompt };
  if (imageList.length > 0) params['image_list'] = imageList;
  if (videoUrl) {
    const videoItem: Record<string, unknown> = {
      video_url: videoUrl,
      refer_type: videoReferType,
    };
    if (flags.keepOriginalSound) videoItem['keep_original_sound'] = flags.keepOriginalSound as string;
    params['video_list'] = [videoItem];
  }
  if (elementList.length > 0) params['element_list'] = elementList;
  if (flags.mode) params['mode'] = flags.mode as string;
  if (flags.aspectRatio) params['aspect_ratio'] = flags.aspectRatio as string;
  if (flags.duration !== undefined) params['duration'] = String(flags.duration);
  if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

  return params;
}

// ── Image generation ─────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'image',
  models: IMAGE_V3_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (flags.imageUrls) {
      throw new CLIError(
        `Model "${model}" supports a single reference image via --image-url, not --image-urls.`,
        ExitCode.USAGE,
      );
    }
    if (flags.imageUrl && flags.negativePrompt) {
      throw new CLIError(
        `Model "${model}" does not support --negative-prompt together with --image-url.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = { prompt };
    if (flags.negativePrompt) params['negative_prompt'] = flags.negativePrompt as string;
    if (flags.imageUrl) params['image'] = flags.imageUrl as string;
    const elementList = buildElementList(flags);
    if (elementList.length > 0) params['element_list'] = elementList;
    if (flags.resolution) params['resolution'] = flags.resolution as string;
    if (flags.n !== undefined) params['n'] = flags.n as number;
    if (flags.aspectRatio) params['aspect_ratio'] = flags.aspectRatio as string;
    if (flags.watermark !== undefined) params['watermark_info'] = { enabled: flags.watermark as boolean };
    if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'kling',
  category: 'image',
  models: OMNI_IMAGE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (flags.negativePrompt) {
      throw new CLIError(
        `Model "${model}" does not support --negative-prompt.`,
        ExitCode.USAGE,
      );
    }
    if (flags.seriesAmount !== undefined && flags.resultType !== 'series') {
      throw new CLIError(
        `Model "${model}" requires --result-type series when using --series-amount.`,
        ExitCode.USAGE,
      );
    }
    if (flags.resultType === 'series' && flags.n !== undefined) {
      throw new CLIError(
        `Model "${model}" does not allow --n when --result-type series is selected.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = { prompt };
    const imageList = buildOmniImageList(flags);
    if (imageList.length > 0) params['image_list'] = imageList;
    if (flags.resolution) params['resolution'] = flags.resolution as string;
    if (flags.n !== undefined) params['n'] = flags.n as number;
    if (flags.aspectRatio) params['aspect_ratio'] = flags.aspectRatio as string;
    if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

    if (model === 'kling_v3_omni_image') {
      if (flags.resultType) params['result_type'] = flags.resultType as string;
      if (flags.seriesAmount !== undefined) params['series_amount'] = flags.seriesAmount as number;
    }

    return buildEnvelope(model, params);
  },
});

// ── Text-to-video ─────────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: T2V_MODELS,
  requiresPrompt(model: string): boolean {
    return T2V_SET.has(model);
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const params: Record<string, unknown> = { prompt };
    applyCommonParams(params, flags);
    return buildEnvelope(model, params);
  },
});

// ── Image-to-video ────────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: I2V_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const image = flags.imageUrl as string | undefined;
    const imageTail = flags.imageTailUrl as string | undefined;

    if (!image && !imageTail) {
      throw new CLIError(
        `Model "${model}" requires --image-url (first frame) or --image-tail-url (last frame).`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = {};
    if (prompt) params['prompt'] = prompt;
    if (image)      params['image']      = image;
    if (imageTail)  params['image_tail'] = imageTail;

    applyCommonParams(params, flags);
    return buildEnvelope(model, params);
  },
});

// ── Avatar video ──────────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: AVATAR_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const image = requireStringFlag(
      flags.imageUrl,
      `Model "${model}" requires --image-url.`,
    );

    const audioId = typeof flags.audioId === 'string' && flags.audioId.length > 0
      ? flags.audioId
      : undefined;
    const soundFile = typeof flags.audioUrl === 'string' && flags.audioUrl.length > 0
      ? flags.audioUrl
      : undefined;

    if (audioId && soundFile) {
      throw new CLIError(
        `Model "${model}" accepts either --audio-id or --audio-url, not both.`,
        ExitCode.USAGE,
      );
    }
    if (!audioId && !soundFile) {
      throw new CLIError(
        `Model "${model}" requires --audio-id or --audio-url.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = { image };
    if (audioId) params['audio_id'] = audioId;
    if (soundFile) params['sound_file'] = soundFile;
    if (prompt) params['prompt'] = prompt;
    if (flags.mode) params['mode'] = flags.mode as string;
    if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

    return buildEnvelope(model, params);
  },
});

// ── Video effects ─────────────────────────────────────────────────────────────

function buildEffectsBody(model: string, flags: GlobalFlags, expectedImages?: number): Record<string, unknown> {
  const images = collectImageInputs(flags);
  if (images.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --image-url or --image-urls.`,
      ExitCode.USAGE,
    );
  }
  if (expectedImages !== undefined && images.length !== expectedImages) {
    throw new CLIError(
      `Model "${model}" requires exactly ${expectedImages} input image${expectedImages === 1 ? '' : 's'}.`,
      ExitCode.USAGE,
    );
  }

  const effectScene = requireStringFlag(
    flags.effectScene,
    `Model "${model}" requires --effect-scene.`,
  );
  const duration = requireNumberFlag(
    flags.duration,
    `Model "${model}" requires --duration.`,
  );

  const params: Record<string, unknown> = {
    input: {
      images,
      duration,
    },
    effect_scene: effectScene,
  };
  if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

  return buildEnvelope(model, params);
}

registerProvider({
  provider: 'kling',
  category: 'video',
  models: EFFECTS_SINGLE_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, _prompt: string, flags: GlobalFlags): Record<string, unknown> {
    return buildEffectsBody(model, flags, 1);
  },
});

registerProvider({
  provider: 'kling',
  category: 'video',
  models: EFFECTS_MULTI_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, _prompt: string, flags: GlobalFlags): Record<string, unknown> {
    return buildEffectsBody(model, flags, 2);
  },
});

// ── Motion control ────────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: MOTION_CONTROL_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const imageUrl = requireStringFlag(
      flags.imageUrl,
      `Model "${model}" requires --image-url.`,
    );
    const videoUrl = requireStringFlag(
      flags.videoUrl,
      `Model "${model}" requires --video-url.`,
    );
    const characterOrientation = requireStringFlag(
      flags.characterOrientation,
      `Model "${model}" requires --character-orientation.`,
    );
    const mode = requireStringFlag(
      flags.mode,
      `Model "${model}" requires --mode.`,
    );

    const params: Record<string, unknown> = {
      image_url: imageUrl,
      video_url: videoUrl,
      character_orientation: characterOrientation,
      mode,
    };
    if (prompt) params['prompt'] = prompt;
    if (flags.keepOriginalSound) params['keep_original_sound'] = flags.keepOriginalSound as string;
    if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;
    if (model === 'kling_v3_motion_control' && flags.watermark !== undefined) {
      params['watermark_info'] = { enabled: flags.watermark as boolean };
    }

    return buildEnvelope(model, params);
  },
});

// ── Duration extension ────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: DURATION_EXTENSION_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, _prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const videoUrl = requireStringFlag(
      flags.videoUrl,
      `Model "${model}" requires --video-url.`,
    );
    const duration = requireNumberFlag(
      flags.duration,
      `Model "${model}" requires --duration.`,
    );

    const params: Record<string, unknown> = {
      video_url: videoUrl,
      duration: String(duration),
    };
    if (flags.aspectRatio) params['aspect_ratio'] = flags.aspectRatio as string;
    if (flags.extensionType) params['extension_type'] = flags.extensionType as string;
    if (flags.videoQuality) params['quality'] = flags.videoQuality as string;
    if (flags.seed !== undefined) params['seed'] = flags.seed as number;
    if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

    return buildEnvelope(model, params);
  },
});

// ── Lipsync video ────────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: LIPSYNC_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const mode = requireStringFlag(
      flags.lipsyncMode,
      `Model "${model}" requires --lipsync-mode.`,
    );
    const videoSource = requireVideoSource(model, flags);

    const input: Record<string, unknown> = {
      mode,
      [videoSource.key]: videoSource.value,
    };

    if (mode === 'text2video') {
      if (!prompt) {
        throw new CLIError(
          `Model "${model}" requires --prompt when --lipsync-mode text2video is used.`,
          ExitCode.USAGE,
        );
      }
      input['text'] = prompt;
      input['voice_id'] = requireStringFlag(
        flags.voiceId,
        `Model "${model}" requires --voice-id when --lipsync-mode text2video is used.`,
      );
      input['voice_language'] = requireStringFlag(
        flags.voiceLanguage,
        `Model "${model}" requires --voice-language when --lipsync-mode text2video is used.`,
      );
      if (flags.voiceSpeed !== undefined) input['voice_speed'] = flags.voiceSpeed as number;
      if (flags.audioUrl) {
        throw new CLIError(
          `Model "${model}" does not allow --audio-url when --lipsync-mode text2video is used.`,
          ExitCode.USAGE,
        );
      }
    } else if (mode === 'audio2video') {
      if (prompt) {
        throw new CLIError(
          `Model "${model}" does not use --prompt when --lipsync-mode audio2video is used.`,
          ExitCode.USAGE,
        );
      }
      input['audio_type'] = 'url';
      input['audio_url'] = requireStringFlag(
        flags.audioUrl,
        `Model "${model}" requires --audio-url when --lipsync-mode audio2video is used.`,
      );
      if (flags.voiceId || flags.voiceLanguage || flags.voiceSpeed !== undefined) {
        throw new CLIError(
          `Model "${model}" does not allow voice options when --lipsync-mode audio2video is used.`,
          ExitCode.USAGE,
        );
      }
    } else {
      throw new CLIError(
        `Model "${model}" only supports --lipsync-mode text2video or audio2video.`,
        ExitCode.USAGE,
      );
    }

    return buildEnvelope(model, { input });
  },
});

// ── Omni video ───────────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'video',
  models: OMNI_VIDEO_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (flags.multiShot === true) {
      throw new CLIError(
        `Model "${model}" does not yet support --multi-shot from the CLI because multi-shot prompt segments are not exposed yet.`,
        ExitCode.USAGE,
      );
    }
    if (model === 'kling_omni_video' && flags.sound) {
      throw new CLIError(
        `Model "${model}" does not support --sound.`,
        ExitCode.USAGE,
      );
    }
    if (flags.shotType) {
      throw new CLIError(
        `Model "${model}" does not support --shot-type in the current CLI implementation.`,
        ExitCode.USAGE,
      );
    }

    const params = buildOmniVideoParams(model, prompt, flags);
    if (model === 'kling_v3_omni_video' && flags.sound) {
      params['sound'] = flags.sound as string;
    }

    return buildEnvelope(model, params);
  },
});

// ── Video to audio ───────────────────────────────────────────────────────────

registerProvider({
  provider: 'kling',
  category: 'audio',
  models: VIDEO_TO_AUDIO_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (prompt) {
      throw new CLIError(
        `Model "${model}" does not use --prompt. Use --sound-effect-prompt and/or --bgm-prompt instead.`,
        ExitCode.USAGE,
      );
    }

    const videoSource = requireVideoSource(model, flags);
    const params: Record<string, unknown> = {
      [videoSource.key]: videoSource.value,
    };
    if (flags.soundEffectPrompt) params['sound_effect_prompt'] = flags.soundEffectPrompt as string;
    if (flags.bgmPrompt) params['bgm_prompt'] = flags.bgmPrompt as string;
    if (flags.asmrMode !== undefined) params['asmr_mode'] = flags.asmrMode as boolean;
    if (flags.externalTaskId) params['external_task_id'] = flags.externalTaskId as string;

    return buildEnvelope(model, params);
  },
});

// ── Tencent Kling video ──────────────────────────────────────────────────────

registerProvider({
  provider: 'tencent',
  category: 'video',
  models: TENCENT_KLING_I2V_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (flags.multiShot === true) {
      throw new CLIError(
        `Model "${model}" does not yet support --multi-shot from the CLI.`,
        ExitCode.USAGE,
      );
    }

    const image = flags.imageUrl as string | undefined;
    const imageTail = flags.imageTailUrl as string | undefined;
    if (!image && !imageTail) {
      throw new CLIError(
        `Model "${model}" requires --image-url or --image-tail-url.`,
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = { prompt };
    if (image) params['image'] = image;
    if (imageTail) params['image_tail'] = imageTail;
    applyCommonParams(params, flags);

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'tencent',
  category: 'video',
  models: TENCENT_KLING_OMNI_VIDEO_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (flags.multiShot === true) {
      throw new CLIError(
        `Model "${model}" does not yet support --multi-shot from the CLI because multi-shot prompt segments are not exposed yet.`,
        ExitCode.USAGE,
      );
    }
    if (flags.shotType) {
      throw new CLIError(
        `Model "${model}" does not support --shot-type in the current CLI implementation.`,
        ExitCode.USAGE,
      );
    }

    const params = buildOmniVideoParams(model, prompt, flags);
    if (flags.sound) params['sound'] = flags.sound as string;

    return buildEnvelope(model, params);
  },
});
