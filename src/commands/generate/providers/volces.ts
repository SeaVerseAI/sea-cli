import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

// ── Model lists ──────────────────────────────────────────────────────────────

const PROMPT_REQUIRED_MODELS = [
  'volces_seedream_5',
  'volces_seedream_4_5',
  'volces_seedream_4_0',
  'volces_seedream_3_0',
  'volces_jimeng_3_1',
  'volces_jimeng_3_0',
  'volces_seededit_3_0',
  'volces_seededit_3_0_i2i',
  'volces_jimeng_i2i_3_0',
  'volces_seededit_single_ip',
  'volces_seededit_multi_ip',
  'volces_seedream_4_5_multi_blend',
];

const PROMPT_OPTIONAL_MODELS = [
  'volces_seededit_portrait',
];

const NO_PROMPT_MODELS = [
  'volces_seededit_multi_style',
  'volces_seededit_3d_style',
  'volces_jimeng_tilesr',
];

export const VOLCES_MODELS = [
  ...PROMPT_REQUIRED_MODELS,
  ...PROMPT_OPTIONAL_MODELS,
  ...NO_PROMPT_MODELS,
] as const;

const PROMPT_REQUIRED_SET = new Set<string>(PROMPT_REQUIRED_MODELS);
const PROMPT_OPTIONAL_SET = new Set<string>(PROMPT_OPTIONAL_MODELS);
const NO_PROMPT_SET = new Set<string>(NO_PROMPT_MODELS);

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildBodyEnvelope(model: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    model,
    dash_scope: true,
    moderation: true,
    input: [{ params }],
    metadata: {},
  };
}

function collectImageInputs(flags: GlobalFlags): string[] {
  const images: string[] = [];

  const single = flags.imageUrl as string | undefined;
  if (single) images.push(single);

  const many = flags.imageUrls as string[] | string | undefined;
  if (Array.isArray(many)) images.push(...many);
  else if (many) images.push(many);

  return images;
}

function requireImageInputs(
  flags: GlobalFlags,
  model: string,
  opts: { min?: number; max?: number; hint?: string } = {},
): string[] {
  const images = collectImageInputs(flags);
  const min = opts.min ?? 1;
  const max = opts.max;

  if (images.length < min) {
    throw new CLIError(
      `Model "${model}" requires ${opts.hint ?? '--image-url'}${min > 1 ? ` (${min}+ images)` : ''}.`,
      ExitCode.USAGE,
    );
  }

  if (max !== undefined && images.length > max) {
    throw new CLIError(
      `Model "${model}" supports at most ${max} input image${max === 1 ? '' : 's'}.`,
      ExitCode.USAGE,
    );
  }

  return images;
}

function requireSingleImage(flags: GlobalFlags, model: string, fieldName = '--image-url'): string {
  return requireImageInputs(flags, model, { min: 1, max: 1, hint: fieldName })[0]!;
}

function maybeSize(flags: GlobalFlags): string | undefined {
  if (flags.size) return flags.size as string;
  if (flags.width && flags.height) return `${flags.width as number}x${flags.height as number}`;
  return undefined;
}

function buildSeedream45FamilyParams(prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = { prompt };
  const images = collectImageInputs(flags);
  const size = maybeSize(flags);

  if (images.length === 1) {
    params.image = images[0];
  } else if (images.length > 1) {
    params.image = images;
  }

  if (size) params.size = size;
  if (flags.seed !== undefined) params.seed = flags.seed as number;

  const batchCount = flags.n as number | undefined;
  if (batchCount !== undefined && batchCount > 1) {
    params.sequential_image_generation = 'auto';
    params.sequential_image_generation_options = { max_images: batchCount };
  }

  return params;
}

function buildSeedream3Params(prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = { prompt };
  if (flags.seed !== undefined) params.seed = flags.seed as number;
  if (flags.scale !== undefined) params.scale = flags.scale as number;
  if (flags.width !== undefined) params.width = flags.width as number;
  if (flags.height !== undefined) params.height = flags.height as number;
  return params;
}

function buildJimengTextParams(prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = { prompt };
  if (flags.seed !== undefined) params.seed = flags.seed as number;
  if (flags.width !== undefined) params.width = flags.width as number;
  if (flags.height !== undefined) params.height = flags.height as number;
  return params;
}

function buildSeededitBasicParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const image = requireSingleImage(flags, model);
  const params: Record<string, unknown> = {
    prompt,
    image_urls: [image],
  };

  if (flags.seed !== undefined) params.seed = flags.seed as number;
  if (flags.scale !== undefined) params.scale = flags.scale as number;
  if (flags.width !== undefined) params.width = flags.width as number;
  if (flags.height !== undefined) params.height = flags.height as number;

  return params;
}

function buildSeededit30I2IParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const image = requireSingleImage(flags, model);
  const params: Record<string, unknown> = {
    prompt,
    image,
  };

  if (flags.seed !== undefined) params.seed = flags.seed as number;
  if (flags.scale !== undefined) params.scale = flags.scale as number;

  const size = maybeSize(flags);
  if (size) params.size = size;

  return params;
}

function buildSeededitMultiIpParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const images = requireImageInputs(flags, model, { min: 1, max: 5, hint: '--image-url/--image-urls' });
  const params: Record<string, unknown> = {
    prompt,
    image_urls: images,
  };

  if (flags.seed !== undefined) params.seed = flags.seed as number;
  if (flags.width !== undefined) params.width = flags.width as number;
  if (flags.height !== undefined) params.height = flags.height as number;

  const refTypes = flags.refType as string[] | string | undefined;
  if (Array.isArray(refTypes)) params.ref_type_list = refTypes;
  else if (refTypes) params.ref_type_list = [refTypes];

  return params;
}

function buildSeededit3dStyleParams(model: string, flags: GlobalFlags): Record<string, unknown> {
  const image = requireSingleImage(flags, model);
  const reqKey = flags.reqKey as string | undefined;
  const subReqKey = flags.subReqKey as string | undefined;

  if (!reqKey) {
    throw new CLIError(
      `Model "${model}" requires --req-key.`,
      ExitCode.USAGE,
    );
  }

  if (!subReqKey) {
    throw new CLIError(
      `Model "${model}" requires --sub-req-key.`,
      ExitCode.USAGE,
    );
  }

  return {
    req_key: reqKey,
    sub_req_key: subReqKey,
    image_urls: [image],
    return_url: true,
  };
}

function buildSeededitMultiStyleParams(model: string, flags: GlobalFlags): Record<string, unknown> {
  const image = requireSingleImage(flags, model);
  const templateId = flags.templateId as string | undefined;

  if (!templateId) {
    throw new CLIError(
      `Model "${model}" requires --template-id.`,
      ExitCode.USAGE,
    );
  }

  const params: Record<string, unknown> = {
    image_input1: image,
    template_id: templateId,
  };

  if (flags.width !== undefined) params.width = flags.width as number;
  if (flags.height !== undefined) params.height = flags.height as number;

  return params;
}

function buildSeededitPortraitParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const image = requireSingleImage(flags, model);
  const params: Record<string, unknown> = {
    image_input: image,
  };

  if (prompt) params.prompt = prompt;
  if (flags.width !== undefined) params.width = flags.width as number;
  if (flags.height !== undefined) params.height = flags.height as number;
  if (flags.gpen !== undefined) params.gpen = flags.gpen as number;
  if (flags.skin !== undefined) params.skin = flags.skin as number;
  if (flags.skinUnifi !== undefined) params.skin_unifi = flags.skinUnifi as number;
  if (flags.genMode !== undefined) params.gen_mode = flags.genMode as string;
  if (flags.seed !== undefined) params.seed = String(flags.seed);

  return params;
}

function buildJimengTileSrParams(model: string, flags: GlobalFlags): Record<string, unknown> {
  const image = requireSingleImage(flags, model);
  const params: Record<string, unknown> = {
    image_url: image,
  };

  if (flags.resolution !== undefined) params.resolution = flags.resolution as string;
  if (flags.scale !== undefined) params.scale = flags.scale as number;

  return params;
}

function buildSeedreamMultiBlendParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const images = requireImageInputs(flags, model, { min: 2, max: 14, hint: '--image-urls' });
  const params: Record<string, unknown> = {
    prompt,
    image: images,
  };

  const size = maybeSize(flags);
  if (size) params.size = size;

  return params;
}

function buildVolcesParams(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  switch (model) {
    case 'volces_seedream_5':
    case 'volces_seedream_4_5':
    case 'volces_seedream_4_0':
      return buildSeedream45FamilyParams(prompt, flags);
    case 'volces_seedream_3_0':
      return buildSeedream3Params(prompt, flags);
    case 'volces_jimeng_3_1':
    case 'volces_jimeng_3_0':
      return buildJimengTextParams(prompt, flags);
    case 'volces_seededit_3_0':
    case 'volces_seededit_single_ip':
      return buildSeededitBasicParams(model, prompt, flags);
    case 'volces_seededit_3_0_i2i':
      return buildSeededit30I2IParams(model, prompt, flags);
    case 'volces_jimeng_i2i_3_0':
      return buildSeededitBasicParams(model, prompt, flags);
    case 'volces_seededit_multi_ip':
      return buildSeededitMultiIpParams(model, prompt, flags);
    case 'volces_seededit_3d_style':
      return buildSeededit3dStyleParams(model, flags);
    case 'volces_seededit_multi_style':
      return buildSeededitMultiStyleParams(model, flags);
    case 'volces_seededit_portrait':
      return buildSeededitPortraitParams(model, prompt, flags);
    case 'volces_jimeng_tilesr':
      return buildJimengTileSrParams(model, flags);
    case 'volces_seedream_4_5_multi_blend':
      return buildSeedreamMultiBlendParams(model, prompt, flags);
    default:
      throw new CLIError(
        `Unsupported Volces image model "${model}".`,
        ExitCode.USAGE,
      );
  }
}

// ── Registration ─────────────────────────────────────────────────────────────

registerProvider({
  provider: 'volces',
  category: 'image',
  models: VOLCES_MODELS,
  requiresPrompt(model: string): boolean {
    if (PROMPT_REQUIRED_SET.has(model)) return true;
    if (PROMPT_OPTIONAL_SET.has(model)) return false;
    if (NO_PROMPT_SET.has(model)) return false;
    return true;
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    return buildBodyEnvelope(model, buildVolcesParams(model, prompt, flags));
  },
});
