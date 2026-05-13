import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const PROMPT_REQUIRED_MODELS = [
  'volces_seedance_3_0',
] as const;

const PROMPT_OPTIONAL_MODELS = [
  'volces_seedance_1_5_pro',
  'volces_seedance_2_0',
  'volces_seedance_2_0_fast',
  'volces_seedance_3_0_pro',
  'volces_seedance_30_i2v',
  'volces_seedance_pro_fast',
  'volces_realman_avatar_picture_omni_v15',
] as const;

const NO_PROMPT_MODELS = [
  'volces_draft_video',
  'volces_jimeng_dream_actor_m1',
  'volces_jimeng_dream_actor_m2',
  'volces_realman_avatar_picture_omni_v2',
  'volces_realman_avatar_imitator_v2v',
] as const;

const VOLCES_VIDEO_MODELS = [
  ...PROMPT_REQUIRED_MODELS,
  ...PROMPT_OPTIONAL_MODELS,
  ...NO_PROMPT_MODELS,
] as const;

const PROMPT_REQUIRED_SET = new Set<string>(PROMPT_REQUIRED_MODELS);
const NO_PROMPT_SET = new Set<string>(NO_PROMPT_MODELS);

function buildBodyEnvelope(model: string, params: Record<string, unknown>): Record<string, unknown> {
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

function maybeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function requirePrimaryImage(flags: GlobalFlags, model: string): string {
  return requireStringFlag(
    flags.imageUrl,
    `Model "${model}" requires --image-url.`,
  );
}

function requireVideoUrl(flags: GlobalFlags, model: string): string {
  return requireStringFlag(
    flags.videoUrl,
    `Model "${model}" requires --video-url.`,
  );
}

function requireAudioUrl(flags: GlobalFlags, model: string): string {
  return requireStringFlag(
    flags.audioUrl,
    `Model "${model}" requires --audio-url.`,
  );
}

function requirePromptOrInput(
  model: string,
  prompt: string,
  values: Array<unknown>,
  hint: string,
): void {
  const hasPrompt = prompt.length > 0;
  const hasInput = values.some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return typeof value === 'string' ? value.length > 0 : value !== undefined && value !== null;
  });

  if (!hasPrompt && !hasInput) {
    throw new CLIError(
      `Model "${model}" requires --prompt or ${hint}.`,
      ExitCode.USAGE,
    );
  }
}

function requireFirstFrameForTail(model: string, flags: GlobalFlags): void {
  if (flags.imageTailUrl && !flags.imageUrl) {
    throw new CLIError(
      `Model "${model}" requires --image-url when using --image-tail-url.`,
      ExitCode.USAGE,
    );
  }
}

function maybeRatio(flags: GlobalFlags): string | undefined {
  return flags.aspectRatio as string | undefined;
}

function maybeFramesPerSecond(flags: GlobalFlags): number | undefined {
  return flags.fps as number | undefined;
}

function maybeSeed(flags: GlobalFlags): number | undefined {
  return flags.seed as number | undefined;
}

function applyCommonSeedanceParams(
  params: Record<string, unknown>,
  flags: GlobalFlags,
  options: {
    includeAudio?: boolean;
    includeServiceTier?: boolean;
    includeExpiresAfter?: boolean;
    includeDraft?: boolean;
    includeFrames?: boolean;
    allowFps?: boolean;
  } = {},
): void {
  if (flags.resolution) params['resolution'] = flags.resolution as string;
  if (maybeRatio(flags)) params['ratio'] = maybeRatio(flags);
  if (flags.duration !== undefined) params['duration'] = flags.duration as number;
  if (options.includeFrames && flags.frames !== undefined) params['frames'] = flags.frames as number;
  if (options.allowFps !== false && maybeFramesPerSecond(flags) !== undefined) {
    params['framespersecond'] = maybeFramesPerSecond(flags);
  }
  if (maybeSeed(flags) !== undefined) params['seed'] = maybeSeed(flags);
  if (flags.watermark !== undefined) params['watermark'] = flags.watermark as boolean;
  if (flags.cameraFixed !== undefined) params['camerafixed'] = flags.cameraFixed as boolean;
  if (flags.returnLastFrame !== undefined) params['return_last_frame'] = flags.returnLastFrame as boolean;
  if (options.includeAudio && flags.audio !== undefined) params['generate_audio'] = flags.audio as boolean;
  if (options.includeServiceTier && flags.serviceTier) params['service_tier'] = flags.serviceTier as string;
  if (options.includeExpiresAfter && flags.expiresAfter !== undefined) {
    params['execution_expires_after'] = flags.expiresAfter as number;
  }
  if (options.includeDraft && flags.draft !== undefined) params['draft'] = flags.draft as boolean;
}

function buildTextItem(text: string): Record<string, unknown> {
  return {
    type: 'text',
    text,
  };
}

function buildImageItem(url: string, role?: string): Record<string, unknown> {
  const item: Record<string, unknown> = {
    type: 'image_url',
    image_url: { url },
  };
  if (role) item['role'] = role;
  return item;
}

function buildVideoItem(url: string, role?: string): Record<string, unknown> {
  const item: Record<string, unknown> = {
    type: 'video_url',
    video_url: { url },
  };
  if (role) item['role'] = role;
  return item;
}

function buildAudioItem(url: string, role?: string): Record<string, unknown> {
  const item: Record<string, unknown> = {
    type: 'audio_url',
    audio_url: { url },
  };
  if (role) item['role'] = role;
  return item;
}

function buildSeedance15ProParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  requireFirstFrameForTail(model, flags);

  const content: Record<string, unknown>[] = [];
  if (prompt) content.push(buildTextItem(prompt));
  if (flags.imageUrl) content.push(buildImageItem(flags.imageUrl as string, 'first_frame'));
  if (flags.imageTailUrl) content.push(buildImageItem(flags.imageTailUrl as string, 'last_frame'));

  if (content.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --prompt or --image-url.`,
      ExitCode.USAGE,
    );
  }

  const params: Record<string, unknown> = { content };
  applyCommonSeedanceParams(params, flags, {
    includeAudio: true,
    includeServiceTier: true,
    includeExpiresAfter: true,
    includeDraft: true,
  });

  return params;
}

function buildSeedance20FamilyParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  requireFirstFrameForTail(model, flags);

  const content: Record<string, unknown>[] = [];
  if (prompt) content.push(buildTextItem(prompt));
  if (flags.imageUrl) content.push(buildImageItem(flags.imageUrl as string, 'first_frame'));
  if (flags.imageTailUrl) content.push(buildImageItem(flags.imageTailUrl as string, 'last_frame'));

  for (const url of maybeStringArray(flags.imageUrls)) {
    content.push(buildImageItem(url, 'reference_image'));
  }

  if (flags.videoUrl) content.push(buildVideoItem(flags.videoUrl as string, 'reference_video'));
  if (flags.audioUrl) content.push(buildAudioItem(flags.audioUrl as string, 'reference_audio'));

  if (content.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --prompt or at least one of --image-url, --image-urls, --video-url, --audio-url.`,
      ExitCode.USAGE,
    );
  }

  const params: Record<string, unknown> = { content };
  applyCommonSeedanceParams(params, flags, {
    includeAudio: true,
    includeServiceTier: true,
  });

  return params;
}

function buildSeedance30Params(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  if (!prompt) {
    throw new CLIError(
      `Model "${model}" requires --prompt.`,
      ExitCode.USAGE,
    );
  }

  const params: Record<string, unknown> = {
    content: [buildTextItem(prompt)],
  };
  applyCommonSeedanceParams(params, flags);
  return params;
}

function buildSeedance30ProParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  requireFirstFrameForTail(model, flags);
  requirePromptOrInput(model, prompt, [flags.imageUrl, flags.imageTailUrl], '--image-url');

  const content: Record<string, unknown>[] = [];
  if (prompt) content.push(buildTextItem(prompt));
  if (flags.imageUrl) content.push(buildImageItem(flags.imageUrl as string, 'first_frame'));
  if (flags.imageTailUrl) content.push(buildImageItem(flags.imageTailUrl as string, 'last_frame'));

  const params: Record<string, unknown> = { content };
  applyCommonSeedanceParams(params, flags);
  return params;
}

function buildSeedance30I2VParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const imageUrl = requirePrimaryImage(flags, model);
  const referenceImages = maybeStringArray(flags.imageUrls);

  if (referenceImages.length > 4) {
    throw new CLIError(
      `Model "${model}" supports at most 4 --image-urls reference images.`,
      ExitCode.USAGE,
    );
  }

  const content: Record<string, unknown>[] = [buildImageItem(imageUrl)];
  if (prompt) content.push(buildTextItem(prompt));
  for (const url of referenceImages) {
    content.push(buildImageItem(url, 'reference_image'));
  }

  const params: Record<string, unknown> = { content };
  applyCommonSeedanceParams(params, flags);
  return params;
}

function buildSeedanceProFastParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  if (flags.frames !== undefined && flags.duration !== undefined) {
    throw new CLIError(
      `Model "${model}" does not allow --frames together with --duration.`,
      ExitCode.USAGE,
    );
  }

  if (flags.fps !== undefined) {
    throw new CLIError(
      `Model "${model}" does not support --fps; frame rate is fixed by the upstream API.`,
      ExitCode.USAGE,
    );
  }

  if (flags.imageTailUrl) {
    throw new CLIError(
      `Model "${model}" does not support --image-tail-url.`,
      ExitCode.USAGE,
    );
  }

  requirePromptOrInput(model, prompt, [flags.imageUrl], '--image-url');

  const content: Record<string, unknown>[] = [];
  if (prompt) content.push(buildTextItem(prompt));
  if (flags.imageUrl) content.push(buildImageItem(flags.imageUrl as string));

  const params: Record<string, unknown> = { content };
  applyCommonSeedanceParams(params, flags, {
    includeFrames: true,
    allowFps: false,
  });
  return params;
}

function buildDraftVideoParams(model: string, flags: GlobalFlags): Record<string, unknown> {
  const draftTaskId = requireStringFlag(
    flags.draftTaskId,
    `Model "${model}" requires --draft-task-id.`,
  );

  return {
    content: [
      {
        type: 'draft_task',
        draft_task: { id: draftTaskId },
      },
    ],
    ...(flags.returnLastFrame !== undefined ? { return_last_frame: flags.returnLastFrame as boolean } : {}),
    ...(flags.serviceTier ? { service_tier: flags.serviceTier as string } : {}),
    ...(flags.expiresAfter !== undefined ? { execution_expires_after: flags.expiresAfter as number } : {}),
    ...(flags.resolution ? { resolution: flags.resolution as string } : {}),
    ...(maybeRatio(flags) ? { ratio: maybeRatio(flags) } : {}),
    ...(flags.duration !== undefined ? { duration: flags.duration as number } : {}),
    ...(maybeFramesPerSecond(flags) !== undefined ? { framespersecond: maybeFramesPerSecond(flags) } : {}),
    ...(flags.watermark !== undefined ? { watermark: flags.watermark as boolean } : {}),
    ...(maybeSeed(flags) !== undefined ? { seed: maybeSeed(flags) } : {}),
    ...(flags.cameraFixed !== undefined ? { camerafixed: flags.cameraFixed as boolean } : {}),
  };
}

function buildDreamActorM1Params(model: string, flags: GlobalFlags): Record<string, unknown> {
  const imageUrl = requirePrimaryImage(flags, model);
  const videoUrl = requireVideoUrl(flags, model);
  const params: Record<string, unknown> = {
    image_url: imageUrl,
    video_url: videoUrl,
    return_url: true,
  };

  if (maybeSeed(flags) !== undefined) params['seed'] = maybeSeed(flags);
  if (flags.videoQuality) params['video_quality'] = flags.videoQuality as string;
  return params;
}

function buildDreamActorM2Params(model: string, flags: GlobalFlags): Record<string, unknown> {
  return {
    image_url: requirePrimaryImage(flags, model),
    video_url: requireVideoUrl(flags, model),
  };
}

function buildAvatarPictureOmniV2Params(model: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = {
    image_url: requirePrimaryImage(flags, model),
    audio_url: requireAudioUrl(flags, model),
  };

  if (flags.resolution) params['resolution'] = flags.resolution as string;
  if (flags.fps !== undefined) params['fps'] = flags.fps as number;
  if (flags.bitrate !== undefined) params['bitrate'] = flags.bitrate as number;
  return params;
}

function buildAvatarImitatorParams(model: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = {
    image_url: requirePrimaryImage(flags, model),
    driving_video_info: {
      video_url: requireVideoUrl(flags, model),
      store_type: 0,
    },
  };

  if (maybeSeed(flags) !== undefined) params['seed'] = maybeSeed(flags);
  if (flags.resolution) params['resolution'] = flags.resolution as string;
  if (flags.fps !== undefined) params['fps'] = flags.fps as number;
  if (flags.bitrate !== undefined) params['bitrate'] = flags.bitrate as number;
  return params;
}

function buildAvatarPictureOmniV15Params(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = {
    image_url: requirePrimaryImage(flags, model),
    audio_url: requireAudioUrl(flags, model),
  };

  const maskUrls = maybeStringArray(flags.maskUrls);
  if (maskUrls.length > 0) params['mask_url'] = maskUrls;
  if (maybeSeed(flags) !== undefined) params['seed'] = maybeSeed(flags);
  if (prompt) params['prompt'] = prompt;
  if (flags.peFastMode !== undefined) params['pe_fast_mode'] = flags.peFastMode as boolean;
  return params;
}

function buildVolcesVideoParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  switch (model) {
    case 'volces_seedance_1_5_pro':
      return buildSeedance15ProParams(model, prompt, flags);
    case 'volces_seedance_2_0':
    case 'volces_seedance_2_0_fast':
      return buildSeedance20FamilyParams(model, prompt, flags);
    case 'volces_seedance_3_0':
      return buildSeedance30Params(model, prompt, flags);
    case 'volces_seedance_3_0_pro':
      return buildSeedance30ProParams(model, prompt, flags);
    case 'volces_seedance_30_i2v':
      return buildSeedance30I2VParams(model, prompt, flags);
    case 'volces_seedance_pro_fast':
      return buildSeedanceProFastParams(model, prompt, flags);
    case 'volces_draft_video':
      return buildDraftVideoParams(model, flags);
    case 'volces_jimeng_dream_actor_m1':
      return buildDreamActorM1Params(model, flags);
    case 'volces_jimeng_dream_actor_m2':
      return buildDreamActorM2Params(model, flags);
    case 'volces_realman_avatar_picture_omni_v2':
      return buildAvatarPictureOmniV2Params(model, flags);
    case 'volces_realman_avatar_imitator_v2v':
      return buildAvatarImitatorParams(model, flags);
    case 'volces_realman_avatar_picture_omni_v15':
      return buildAvatarPictureOmniV15Params(model, prompt, flags);
    default:
      throw new CLIError(`Unsupported Volces video model "${model}".`, ExitCode.USAGE);
  }
}

registerProvider({
  provider: 'volces',
  category: 'video',
  models: VOLCES_VIDEO_MODELS,
  requiresPrompt(model: string): boolean {
    if (PROMPT_REQUIRED_SET.has(model)) return true;
    if (NO_PROMPT_SET.has(model)) return false;
    return false;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    return buildBodyEnvelope(model, buildVolcesVideoParams(model, prompt, flags));
  },
});
