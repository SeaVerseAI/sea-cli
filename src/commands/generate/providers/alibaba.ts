import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const IMAGE_MODELS = [
  'alibaba_wan27_image',
  'alibaba_wan27_image_pro',
] as const;

const VIDEO_T2V_27_MODELS = [
  'alibaba_wan27_t2v',
] as const;

const VIDEO_T2V_26_MODELS = [
  'alibaba_wanx26_t2v',
] as const;

const VIDEO_I2V_27_MODELS = [
  'alibaba_wan27_i2v',
] as const;

const VIDEO_I2V_26_MODELS = [
  'alibaba_wanx26_i2v',
  'alibaba_wanx26_i2v_flash',
] as const;

const VIDEO_REF_27_MODELS = [
  'alibaba_wan27_r2v',
] as const;

const VIDEO_REF_26_MODELS = [
  'alibaba_wanx26_reference',
] as const;

const VIDEO_EDIT_MODELS = [
  'alibaba_wan27_videoedit',
] as const;

const WAN27_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4']);
const WAN27_VIDEO_RESOLUTIONS = new Set(['720P', '1080P']);

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

function collectImageInputs(flags: GlobalFlags): string[] {
  const images = maybeStringArray(flags.imageUrls);
  const imageUrl = maybeString(flags.imageUrl);
  return imageUrl ? [imageUrl, ...images] : images;
}

function requireSingleImage(model: string, flags: GlobalFlags): string {
  const primary = maybeString(flags.imageUrl);
  const extras = maybeStringArray(flags.imageUrls);
  if (!primary || extras.length > 0) {
    throw new CLIError(
      `Model "${model}" requires exactly one input image via --image-url.`,
      ExitCode.USAGE,
    );
  }
  return primary;
}

function requireReferenceUrls(model: string, flags: GlobalFlags): string[] {
  const refs = maybeStringArray(flags.referenceUrls);
  if (refs.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --reference-urls.`,
      ExitCode.USAGE,
    );
  }
  return refs;
}

function buildEnvelope(model: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    moderation: true,
    input: [{ params }],
    metadata: {},
  };
}

function buildMessageContent(prompt: string, flags: GlobalFlags): Array<Record<string, string>> {
  const content: Array<Record<string, string>> = [];
  for (const image of collectImageInputs(flags)) {
    content.push({ image });
  }
  content.push({ text: prompt });
  return content;
}

function assertUnsupportedImageFlags(model: string, flags: GlobalFlags): void {
  assertUnsupported(model, flags.modelVerNo, 'model-ver-no');
  assertUnsupported(model, flags.steps, 'steps');
  assertUnsupported(model, flags.cfgScale, 'cfg-scale');
  assertUnsupported(model, flags.denoise, 'denoise');
  assertUnsupported(model, flags.action, 'action');
  assertUnsupported(model, flags.width, 'width');
  assertUnsupported(model, flags.height, 'height');
  assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
  assertUnsupported(model, flags.resolution, 'resolution');
  assertUnsupported(model, flags.logoAdd, 'logo-add');
  assertUnsupported(model, flags.revise, 'revise');
  assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
  assertUnsupported(model, flags.externalTaskId, 'external-task-id');
  assertUnsupported(model, flags.elementIds, 'element-ids');
  assertUnsupported(model, flags.resultType, 'result-type');
  assertUnsupported(model, flags.seriesAmount, 'series-amount');
  assertUnsupported(model, flags.scale, 'scale');
  assertUnsupported(model, flags.templateId, 'template-id');
  assertUnsupported(model, flags.reqKey, 'req-key');
  assertUnsupported(model, flags.subReqKey, 'sub-req-key');
  assertUnsupported(model, flags.refType, 'ref-type');
  assertUnsupported(model, flags.gpen, 'gpen');
  assertUnsupported(model, flags.skin, 'skin');
  assertUnsupported(model, flags.skinUnifi, 'skin-unifi');
  assertUnsupported(model, flags.genMode, 'gen-mode');
}

function assertUnsupportedAlibabaVideoFlags(model: string, flags: GlobalFlags): void {
  const entries: Array<[string, unknown]> = [
    ['short', flags.short],
    ['fps', flags.fps],
    ['frames', flags.frames],
    ['service-tier', flags.serviceTier],
    ['expires-after', flags.expiresAfter],
    ['style', flags.style],
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
    ['mask-urls', flags.maskUrls],
    ['movement-amplitude', flags.movementAmplitude],
    ['mode', flags.mode],
    ['cfg-scale', flags.cfgScale],
    ['video-quality', flags.videoQuality],
    ['pe-fast-mode', flags.peFastMode],
    ['audio-id', flags.audioId],
    ['voice-id', flags.voiceId],
    ['voice-language', flags.voiceLanguage],
    ['voice-speed', flags.voiceSpeed],
    ['bgm', flags.bgm],
    ['sound', flags.sound],
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

registerProvider({
  provider: 'alibaba',
  category: 'image',
  models: IMAGE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedImageFlags(model, flags);

    const upstreamInput: Record<string, unknown> = {
      messages: [{ role: 'user', content: buildMessageContent(prompt, flags) }],
    };

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.size) upstreamParameters['size'] = flags.size as string;
    if (flags.n) upstreamParameters['n'] = flags.n as number;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.watermark !== undefined) upstreamParameters['watermark'] = flags.watermark as boolean;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_T2V_27_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.videoId, 'video-id');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.shotType, 'shot-type');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupportedAlibabaVideoFlags(model, flags);

    const upstreamInput: Record<string, unknown> = { prompt };
    if (flags.audioUrl) upstreamInput['audio_url'] = flags.audioUrl as string;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.resolution !== undefined) {
      upstreamParameters['resolution'] = parseEnum(model, flags.resolution, 'resolution', WAN27_VIDEO_RESOLUTIONS);
    }
    if (flags.aspectRatio !== undefined) {
      upstreamParameters['ratio'] = parseEnum(model, flags.aspectRatio, 'aspect-ratio', WAN27_RATIOS);
    }
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.watermark !== undefined) upstreamParameters['watermark'] = flags.watermark as boolean;
    if (flags.negativePrompt) upstreamParameters['negative_prompt'] = flags.negativePrompt as string;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_T2V_26_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.videoId, 'video-id');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.resolution, 'resolution');
    assertUnsupported(model, flags.watermark, 'watermark');
    assertUnsupportedAlibabaVideoFlags(model, flags);

    const upstreamInput: Record<string, unknown> = { prompt };
    if (flags.audioUrl) upstreamInput['audio_url'] = flags.audioUrl as string;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.size) upstreamParameters['size'] = flags.size as string;
    if (flags.shotType) upstreamParameters['shot_type'] = flags.shotType as string;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.audio !== undefined) upstreamParameters['audio'] = flags.audio as boolean;
    if (flags.negativePrompt) upstreamParameters['negative_prompt'] = flags.negativePrompt as string;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_I2V_27_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedAlibabaVideoFlags(model, flags);
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.shotType, 'shot-type');
    assertUnsupported(model, flags.audio, 'audio');

    const media: Array<Record<string, string>> = [
      { type: 'first_frame', url: requireSingleImage(model, flags) },
    ];

    const lastFrame = maybeString(flags.imageTailUrl);
    if (lastFrame) media.push({ type: 'last_frame', url: lastFrame });

    const drivingAudio = maybeString(flags.audioUrl);
    if (drivingAudio) media.push({ type: 'driving_audio', url: drivingAudio });

    const firstClip = maybeString(flags.videoUrl);
    if (firstClip) media.push({ type: 'first_clip', url: firstClip });

    const upstreamInput: Record<string, unknown> = { media };
    if (prompt) upstreamInput['prompt'] = prompt;
    if (flags.negativePrompt) upstreamInput['negative_prompt'] = flags.negativePrompt as string;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.resolution !== undefined) {
      upstreamParameters['resolution'] = parseEnum(model, flags.resolution, 'resolution', WAN27_VIDEO_RESOLUTIONS);
    }
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.watermark !== undefined) upstreamParameters['watermark'] = flags.watermark as boolean;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_I2V_26_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedAlibabaVideoFlags(model, flags);
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.videoId, 'video-id');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.shotType, 'shot-type');
    assertUnsupported(model, flags.watermark, 'watermark');

    const upstreamInput: Record<string, unknown> = { img_url: requireSingleImage(model, flags) };
    if (prompt) upstreamInput['prompt'] = prompt;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.resolution) upstreamParameters['resolution'] = flags.resolution as string;
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.negativePrompt) upstreamParameters['negative_prompt'] = flags.negativePrompt as string;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_REF_27_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedAlibabaVideoFlags(model, flags);
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.shotType, 'shot-type');
    assertUnsupported(model, flags.videoId, 'video-id');

    const media: Array<Record<string, string>> = [];
    const firstFrame = maybeString(flags.imageUrl);
    if (firstFrame) media.push({ type: 'first_frame', url: firstFrame });
    for (const image of maybeStringArray(flags.imageUrls)) {
      media.push({ type: 'reference_image', url: image });
    }
    const referenceVideo = maybeString(flags.videoUrl);
    if (referenceVideo) media.push({ type: 'reference_video', url: referenceVideo });

    if (media.length === 0) {
      throw new CLIError(
        `Model "${model}" requires at least one media input via --image-url, --image-urls, or --video-url.`,
        ExitCode.USAGE,
      );
    }

    const upstreamInput: Record<string, unknown> = { media };
    if (prompt) upstreamInput['prompt'] = prompt;
    if (flags.negativePrompt) upstreamInput['negative_prompt'] = flags.negativePrompt as string;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.resolution !== undefined) {
      upstreamParameters['resolution'] = parseEnum(model, flags.resolution, 'resolution', WAN27_VIDEO_RESOLUTIONS);
    }
    if (flags.aspectRatio !== undefined) {
      upstreamParameters['ratio'] = parseEnum(model, flags.aspectRatio, 'aspect-ratio', WAN27_RATIOS);
    }
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.watermark !== undefined) upstreamParameters['watermark'] = flags.watermark as boolean;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_REF_26_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedAlibabaVideoFlags(model, flags);
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.videoUrl, 'video-url');
    assertUnsupported(model, flags.videoId, 'video-id');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.resolution, 'resolution');
    assertUnsupported(model, flags.watermark, 'watermark');

    const upstreamInput: Record<string, unknown> = {
      reference_urls: requireReferenceUrls(model, flags),
    };
    if (prompt) upstreamInput['prompt'] = prompt;
    if (flags.audioUrl) upstreamInput['audio_url'] = flags.audioUrl as string;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.size) upstreamParameters['size'] = flags.size as string;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.audio !== undefined) upstreamParameters['audio'] = flags.audio as boolean;
    if (flags.shotType) upstreamParameters['shot_type'] = flags.shotType as string;
    if (flags.negativePrompt) upstreamParameters['negative_prompt'] = flags.negativePrompt as string;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'alibaba',
  category: 'video',
  models: VIDEO_EDIT_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupportedAlibabaVideoFlags(model, flags);
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.shotType, 'shot-type');
    assertUnsupported(model, flags.videoId, 'video-id');

    const videoUrl = maybeString(flags.videoUrl);
    if (!videoUrl) {
      throw new CLIError(
        `Model "${model}" requires --video-url.`,
        ExitCode.USAGE,
      );
    }

    const media: Array<Record<string, string>> = [{ type: 'video', url: videoUrl }];
    for (const image of collectImageInputs(flags)) {
      media.push({ type: 'reference_image', url: image });
    }

    const upstreamInput: Record<string, unknown> = { media };
    if (prompt) upstreamInput['prompt'] = prompt;
    if (flags.negativePrompt) upstreamInput['negative_prompt'] = flags.negativePrompt as string;

    const upstreamParameters: Record<string, unknown> = {};
    if (flags.resolution !== undefined) {
      upstreamParameters['resolution'] = parseEnum(model, flags.resolution, 'resolution', WAN27_VIDEO_RESOLUTIONS);
    }
    if (flags.aspectRatio !== undefined) {
      upstreamParameters['ratio'] = parseEnum(model, flags.aspectRatio, 'aspect-ratio', WAN27_RATIOS);
    }
    if (flags.duration !== undefined) upstreamParameters['duration'] = flags.duration as number;
    if (flags.seed !== undefined) upstreamParameters['seed'] = flags.seed as number;
    if (flags.watermark !== undefined) upstreamParameters['watermark'] = flags.watermark as boolean;

    const params: Record<string, unknown> = { input: upstreamInput };
    if (Object.keys(upstreamParameters).length > 0) params['parameters'] = upstreamParameters;

    return buildEnvelope(model, params);
  },
});
