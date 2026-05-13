import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const TENCENT_VIDEO_MODELS = [
  'tencent_mps_super_resolution',
] as const;

const DEFINITIONS = new Set(['720P', '1080P', '2K', '4K']);

function buildEnvelope(model: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    dash_scope: true,
    moderation: true,
    input: [{ params }],
    metadata: {},
  };
}

function assertUnsupported(model: string, value: unknown, flagName: string, hint?: string): void {
  if (value === undefined) return;
  throw new CLIError(
    hint ?? `Model "${model}" does not support --${flagName}.`,
    ExitCode.USAGE,
  );
}

function parseDefinition(model: string, value: unknown): string {
  if (typeof value !== 'string' || !DEFINITIONS.has(value)) {
    throw new CLIError(
      `Model "${model}" requires --resolution to be one of: ${Array.from(DEFINITIONS).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseShort(model: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
    throw new CLIError(
      `Model "${model}" requires --short to be 0 or 1.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

registerProvider({
  provider: 'tencent',
  category: 'video',
  models: TENCENT_VIDEO_MODELS,
  requiresPrompt(): boolean {
    return false;
  },
  buildBody(model: string, _prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const videoUrl = typeof flags.videoUrl === 'string' && flags.videoUrl.length > 0 ? flags.videoUrl : undefined;
    if (!videoUrl) {
      throw new CLIError(
        `Model "${model}" requires --video-url.`,
        ExitCode.USAGE,
      );
    }

    assertUnsupported(model, flags.prompt, 'prompt');
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageTailUrl, 'image-tail-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.referenceUrls, 'reference-urls');
    assertUnsupported(model, flags.videoId, 'video-id');
    assertUnsupported(model, flags.duration, 'duration');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.seed, 'seed');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.fps, 'fps');
    assertUnsupported(model, flags.frames, 'frames');
    assertUnsupported(model, flags.serviceTier, 'service-tier');
    assertUnsupported(model, flags.expiresAfter, 'expires-after');
    assertUnsupported(model, flags.watermark, 'watermark');
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
    assertUnsupported(model, flags.draftTaskId, 'draft-task-id');
    assertUnsupported(model, flags.maskUrls, 'mask-urls');
    assertUnsupported(model, flags.movementAmplitude, 'movement-amplitude');
    assertUnsupported(model, flags.mode, 'mode');
    assertUnsupported(model, flags.shotType, 'shot-type');
    assertUnsupported(model, flags.multiShot, 'multi-shot');
    assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
    assertUnsupported(model, flags.cfgScale, 'cfg-scale');
    assertUnsupported(model, flags.videoQuality, 'video-quality');
    assertUnsupported(model, flags.peFastMode, 'pe-fast-mode');
    assertUnsupported(model, flags.audio, 'audio');
    assertUnsupported(model, flags.audioId, 'audio-id');
    assertUnsupported(model, flags.voiceId, 'voice-id');
    assertUnsupported(model, flags.voiceLanguage, 'voice-language');
    assertUnsupported(model, flags.voiceSpeed, 'voice-speed');
    assertUnsupported(model, flags.bgm, 'bgm');
    assertUnsupported(model, flags.sound, 'sound');
    assertUnsupported(model, flags.audioUrl, 'audio-url');
    assertUnsupported(model, flags.sounds, 'sounds');
    assertUnsupported(model, flags.bitrate, 'bitrate');
    assertUnsupported(model, flags.extensionType, 'extension-type');

    const params: Record<string, unknown> = {
      input_url: videoUrl,
      definition: parseDefinition(model, flags.resolution),
    };

    const short = parseShort(model, flags.short);
    if (short !== undefined) params['short'] = short;

    return buildEnvelope(model, params);
  },
});
