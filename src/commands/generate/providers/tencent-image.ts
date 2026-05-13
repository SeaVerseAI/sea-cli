import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const TENCENT_IMAGE_MODELS = [
  'tencent_image_creation_3',
] as const;

const RESOLUTIONS = new Set([
  '640:1408',
  '704:1344',
  '768:1280',
  '832:1216',
  '896:1152',
  '960:1088',
  '1024:1024',
  '1088:960',
  '1152:896',
  '1216:832',
  '1280:768',
  '1344:704',
  '1408:640',
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

function assertUnsupported(model: string, value: unknown, flagName: string, hint?: string): void {
  if (value === undefined) return;
  throw new CLIError(
    hint ?? `Model "${model}" does not support --${flagName}.`,
    ExitCode.USAGE,
  );
}

function parseToggle(model: string, value: unknown, flagName: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be 0 or 1.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseSeed(model: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isInteger(value) || value <= 0) {
    throw new CLIError(
      `Model "${model}" requires --seed to be a positive integer.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function parseResolution(model: string, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !RESOLUTIONS.has(value)) {
    throw new CLIError(
      `Model "${model}" requires --resolution to be one of: ${Array.from(RESOLUTIONS).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

registerProvider({
  provider: 'tencent',
  category: 'image',
  models: TENCENT_IMAGE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.width, 'width');
    assertUnsupported(model, flags.height, 'height');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.n, 'n');
    assertUnsupported(model, flags.negativePrompt, 'negative-prompt');
    assertUnsupported(model, flags.externalTaskId, 'external-task-id');
    assertUnsupported(
      model,
      flags.watermark,
      'watermark',
      `Model "${model}" does not support --watermark; use --logo-add 0 or --logo-add 1 instead.`,
    );

    const params: Record<string, unknown> = { prompt };

    const resolution = parseResolution(model, flags.resolution);
    if (resolution) params['resolution'] = resolution;

    const seed = parseSeed(model, flags.seed);
    if (seed !== undefined) params['seed'] = seed;

    const logoAdd = parseToggle(model, flags.logoAdd, 'logo-add');
    if (logoAdd !== undefined) params['logo_add'] = logoAdd;

    const revise = parseToggle(model, flags.revise, 'revise');
    if (revise !== undefined) params['revise'] = revise;

    return buildEnvelope(model, params);
  },
});
