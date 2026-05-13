import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const TRIPO3D_IMAGE_MODELS = [
  'tripo3d_text_to_image',
] as const;

const TRIPO3D_3D_MODELS = [
  'tripo3d_image_to_model',
  'tripo3d_multiview_to_model',
  'tripo3d_text_to_model',
] as const;

const IMAGE_TO_MODEL_MODELS = new Set<string>(['tripo3d_image_to_model']);
const MULTIVIEW_MODELS = new Set<string>(['tripo3d_multiview_to_model']);
const TEXT_TO_MODEL_MODELS = new Set<string>(['tripo3d_text_to_model']);

const IMAGE_AND_TEXT_MODEL_VERSIONS = new Set([
  'Turbo-v1.0-20250506',
  'v3.0-20250812',
  'v2.5-20250123',
  'v2.0-20240919',
  'v1.4-20240625',
  'v1.3-20240522',
]);

const MULTIVIEW_MODEL_VERSIONS = new Set([
  'v2.5-20250123',
  'v2.0-20240919',
  'v1.4-20240625',
]);

const TEXTURE_ALIGNMENTS = new Set(['original_image', 'geometry']);
const QUALITY_LEVELS = new Set(['standard', 'detailed']);
const TEXT_TO_MODEL_STYLES = new Set([
  'realistic',
  'cartoon',
  'anime',
  'low_poly',
  'sci_fi',
  'fantasy',
  'abstract',
  'minimalist',
  'steampunk',
  'cyberpunk',
]);
const TEXT_TO_MODEL_ORIENTATIONS = new Set([
  'default',
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
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

function requireImageUrl(model: string, flags: GlobalFlags): string {
  const imageUrl = maybeString(flags.imageUrl);
  if (!imageUrl) {
    throw new CLIError(
      `Model "${model}" requires --image-url.`,
      ExitCode.USAGE,
    );
  }
  return imageUrl;
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

function parseToggle(model: string, value: unknown, flagName: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isInteger(value) || (value !== 0 && value !== 1)) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be 0 or 1.`,
      ExitCode.USAGE,
    );
  }
  return value === 1;
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

function parseModelVersion(model: string, value: unknown): string | undefined {
  const allowed = MULTIVIEW_MODELS.has(model) ? MULTIVIEW_MODEL_VERSIONS : IMAGE_AND_TEXT_MODEL_VERSIONS;
  return parseEnum(model, value, 'model-version', allowed);
}

function parseFaceLimit(model: string, flags: GlobalFlags, smartLowPoly?: boolean, quad?: boolean): number | undefined {
  const range = MULTIVIEW_MODELS.has(model) && smartLowPoly === true && quad === true
    ? { min: 500, max: 8000 }
    : { min: 1000, max: 16000 };
  return parseInteger(model, flags.faceLimit, 'face-limit', range);
}

function parseOptionalText(model: string, value: unknown, flagName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new CLIError(
      `Model "${model}" requires --${flagName} to be a non-empty string.`,
      ExitCode.USAGE,
    );
  }
  return value;
}

function collectShared3dParams(model: string, flags: GlobalFlags): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  const modelVersion = parseModelVersion(model, flags.modelVersion);
  if (modelVersion) params['model_version'] = modelVersion;

  if (MULTIVIEW_MODELS.has(model)) {
    assertUnsupported(model, flags.modelSeed, 'model-seed');
    assertUnsupported(model, flags.style, 'style');
    assertUnsupported(model, flags.geometryQuality, 'geometry-quality');
  } else {
    const modelSeed = parseInteger(model, flags.modelSeed, 'model-seed');
    if (modelSeed !== undefined) params['model_seed'] = modelSeed;
  }

  const texture = parseToggle(model, flags.texture, 'texture');
  if (texture !== undefined) params['texture'] = texture;

  const pbr = parseToggle(model, flags.pbr, 'pbr');
  if (pbr !== undefined) params['pbr'] = pbr;

  const quad = parseToggle(model, flags.quad, 'quad');
  if (quad !== undefined) params['quad'] = quad;

  const smartLowPoly = parseToggle(model, flags.smartLowPoly, 'smart-low-poly');
  if (smartLowPoly !== undefined) params['smart_low_poly'] = smartLowPoly;

  const faceLimit = parseFaceLimit(model, flags, smartLowPoly, quad);
  if (faceLimit !== undefined) params['face_limit'] = faceLimit;

  const textureSeed = parseInteger(model, flags.textureSeed, 'texture-seed');
  if (textureSeed !== undefined) params['texture_seed'] = textureSeed;

  const textureAlignment = parseEnum(model, flags.textureAlignment, 'texture-alignment', TEXTURE_ALIGNMENTS);
  if (textureAlignment) params['texture_alignment'] = textureAlignment;

  const textureQuality = parseEnum(model, flags.textureQuality, 'texture-quality', QUALITY_LEVELS);
  if (textureQuality) params['texture_quality'] = textureQuality;

  const autoSize = parseToggle(model, flags.autoSize, 'auto-size');
  if (autoSize !== undefined) params['auto_size'] = autoSize;

  if (TEXT_TO_MODEL_MODELS.has(model)) {
    const style = parseEnum(model, flags.style, 'style', TEXT_TO_MODEL_STYLES);
    if (style) params['style'] = style;

    const orientation = parseEnum(model, flags.orientation, 'orientation', TEXT_TO_MODEL_ORIENTATIONS);
    if (orientation) params['orientation'] = orientation;
  } else {
    const style = parseOptionalText(model, flags.style, 'style');
    if (style) params['style'] = style;

    const orientation = parseOptionalText(model, flags.orientation, 'orientation');
    if (orientation) params['orientation'] = orientation;
  }

  if (!MULTIVIEW_MODELS.has(model)) {
    const geometryQuality = parseEnum(model, flags.geometryQuality, 'geometry-quality', QUALITY_LEVELS);
    if (geometryQuality) params['geometry_quality'] = geometryQuality;
  }

  const compress = parseOptionalText(model, flags.compress, 'compress');
  if (compress) params['compress'] = compress;

  const generateParts = parseToggle(model, flags.generateParts, 'generate-parts');
  if (generateParts !== undefined) {
    params['generate_parts'] = generateParts;
  }
  if (generateParts === true) {
    if (texture !== false || pbr !== false) {
      throw new CLIError(
        `Model "${model}" requires --texture 0 and --pbr 0 when --generate-parts 1 is set.`,
        ExitCode.USAGE,
      );
    }
    if (quad === true) {
      throw new CLIError(
        `Model "${model}" does not allow --quad 1 when --generate-parts 1 is set.`,
        ExitCode.USAGE,
      );
    }
  }

  return params;
}

registerProvider({
  provider: 'tripo3d',
  category: 'image',
  models: TRIPO3D_IMAGE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupported(model, flags.modelVerNo, 'model-ver-no');
    assertUnsupported(model, flags.steps, 'steps');
    assertUnsupported(model, flags.cfgScale, 'cfg-scale');
    assertUnsupported(model, flags.denoise, 'denoise');
    assertUnsupported(model, flags.action, 'action');
    assertUnsupported(model, flags.n, 'n');
    assertUnsupported(model, flags.imageUrl, 'image-url');
    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.width, 'width');
    assertUnsupported(model, flags.height, 'height');
    assertUnsupported(model, flags.size, 'size');
    assertUnsupported(model, flags.aspectRatio, 'aspect-ratio');
    assertUnsupported(model, flags.resolution, 'resolution');
    assertUnsupported(model, flags.seed, 'seed');
    assertUnsupported(model, flags.logoAdd, 'logo-add');
    assertUnsupported(model, flags.revise, 'revise');
    assertUnsupported(model, flags.watermark, 'watermark');
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

    const params: Record<string, unknown> = { prompt };
    const negativePrompt = maybeString(flags.negativePrompt);
    if (negativePrompt) params['negative_prompt'] = negativePrompt;

    return buildEnvelope(model, params);
  },
});

registerProvider({
  provider: 'tripo3d',
  category: '3d',
  models: TRIPO3D_3D_MODELS,
  requiresPrompt(model: string): boolean {
    return TEXT_TO_MODEL_MODELS.has(model);
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    assertUnsupported(model, flags.imageBase64, 'image-base64');
    assertUnsupported(model, flags.multiViewImages, 'multi-view-image');
    assertUnsupported(model, flags.resultFormat, 'result-format');
    assertUnsupported(model, flags.enablePbr, 'enable-pbr');
    assertUnsupported(model, flags.faceCount, 'face-count');
    assertUnsupported(model, flags.generateType, 'generate-type');
    assertUnsupported(model, flags.polygonType, 'polygon-type');

    const params = collectShared3dParams(model, flags);

    if (IMAGE_TO_MODEL_MODELS.has(model)) {
      if (prompt.length > 0) {
        throw new CLIError(
          `Model "${model}" does not support --prompt.`,
          ExitCode.USAGE,
        );
      }
      assertUnsupported(model, flags.imageUrls, 'image-urls');
      params['file'] = { url: requireImageUrl(model, flags) };
      return buildEnvelope(model, params);
    }

    if (MULTIVIEW_MODELS.has(model)) {
      if (prompt.length > 0) {
        throw new CLIError(
          `Model "${model}" does not support --prompt.`,
          ExitCode.USAGE,
        );
      }
      assertUnsupported(model, flags.imageUrl, 'image-url');
      const imageUrls = maybeStringArray(flags.imageUrls);
      if (imageUrls.length !== 4) {
        throw new CLIError(
          `Model "${model}" requires exactly 4 --image-urls values ordered as front, left, back, right.`,
          ExitCode.USAGE,
        );
      }
      params['files'] = imageUrls.map((url) => ({ type: 'image', url }));
      return buildEnvelope(model, params);
    }

    if (TEXT_TO_MODEL_MODELS.has(model)) {
      if (!prompt) {
        throw new CLIError(
          `Model "${model}" requires --prompt.`,
          ExitCode.USAGE,
        );
      }
      assertUnsupported(model, flags.imageUrl, 'image-url');
      assertUnsupported(model, flags.imageUrls, 'image-urls');
      params['prompt'] = prompt;
      return buildEnvelope(model, params);
    }

    throw new CLIError(`Unsupported Tripo3D model "${model}".`, ExitCode.USAGE);
  },
});
