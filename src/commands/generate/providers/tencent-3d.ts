import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const TENCENT_3D_MODELS = [
  'tencent_hunyuan_3d',
  'tencent_hunyuan_3d_pro',
  'tencent_hunyuan_3d_rapid',
] as const;

const BASE_MODELS = new Set<string>(['tencent_hunyuan_3d']);
const PRO_MODELS = new Set<string>(['tencent_hunyuan_3d_pro']);
const RAPID_MODELS = new Set<string>(['tencent_hunyuan_3d_rapid']);

const RESULT_FORMATS = new Set(['OBJ', 'GLB', 'STL', 'USDZ', 'FBX', 'MP4']);
const GENERATE_TYPES = new Set(['Normal', 'LowPoly', 'Geometry', 'Sketch']);
const POLYGON_TYPES = new Set(['triangle', 'quadrilateral']);
const MULTI_VIEW_DIRECTIONS = new Set(['left', 'right', 'back']);

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
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function assertNoFlag(model: string, flagValue: unknown, flagName: string): void {
  if (flagValue === undefined) return;
  throw new CLIError(
    `Model "${model}" does not support --${flagName}.`,
    ExitCode.USAGE,
  );
}

function collectPrimaryInput(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
  const promptValue = prompt.length > 0 ? prompt : undefined;
  const imageUrl = maybeString(flags.imageUrl);
  const imageBase64 = maybeString(flags.imageBase64);
  const sources = [promptValue, imageUrl, imageBase64].filter((value) => value !== undefined);

  if (sources.length !== 1) {
    throw new CLIError(
      `Model "${model}" requires exactly one of --prompt, --image-url, or --image-base64.`,
      ExitCode.USAGE,
    );
  }

  if (promptValue) return { prompt: promptValue };
  if (imageUrl) return { image_url: imageUrl };
  return { image_base64: imageBase64! };
}

function parseResultFormat(model: string, flags: GlobalFlags): string | undefined {
  const resultFormat = maybeString(flags.resultFormat);
  if (!resultFormat) return undefined;
  if (!RESULT_FORMATS.has(resultFormat)) {
    throw new CLIError(
      `Model "${model}" requires --result-format to be one of: ${Array.from(RESULT_FORMATS).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return resultFormat;
}

function parseFaceCount(model: string, flags: GlobalFlags): number | undefined {
  if (flags.faceCount === undefined) return undefined;
  if (typeof flags.faceCount !== 'number' || Number.isNaN(flags.faceCount) || !Number.isInteger(flags.faceCount)) {
    throw new CLIError(
      `Model "${model}" requires --face-count to be an integer.`,
      ExitCode.USAGE,
    );
  }
  if (flags.faceCount < 40000 || flags.faceCount > 1500000) {
    throw new CLIError(
      `Model "${model}" requires --face-count to be between 40000 and 1500000.`,
      ExitCode.USAGE,
    );
  }
  return flags.faceCount;
}

function parseGenerateType(model: string, flags: GlobalFlags): string | undefined {
  const generateType = maybeString(flags.generateType);
  if (!generateType) return undefined;
  if (!GENERATE_TYPES.has(generateType)) {
    throw new CLIError(
      `Model "${model}" requires --generate-type to be one of: ${Array.from(GENERATE_TYPES).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return generateType;
}

function parsePolygonType(model: string, flags: GlobalFlags): string | undefined {
  const polygonType = maybeString(flags.polygonType);
  if (!polygonType) return undefined;
  if (!POLYGON_TYPES.has(polygonType)) {
    throw new CLIError(
      `Model "${model}" requires --polygon-type to be one of: ${Array.from(POLYGON_TYPES).join(', ')}.`,
      ExitCode.USAGE,
    );
  }
  return polygonType;
}

function parseBaseMultiViewImages(model: string, flags: GlobalFlags): Array<Record<string, unknown>> | undefined {
  const specs = maybeStringArray(flags.multiViewImages);
  if (specs.length === 0) return undefined;

  const seen = new Set<string>();
  return specs.map((spec) => {
    const separator = spec.indexOf('=');
    if (separator <= 0 || separator === spec.length - 1) {
      throw new CLIError(
        `Model "${model}" requires each --multi-view-image to use the format <left|right|back>=<url|base64:data>.`,
        ExitCode.USAGE,
      );
    }

    const direction = spec.slice(0, separator).toLowerCase();
    const value = spec.slice(separator + 1);
    if (!MULTI_VIEW_DIRECTIONS.has(direction)) {
      throw new CLIError(
        `Model "${model}" requires multi-view directions to be one of: ${Array.from(MULTI_VIEW_DIRECTIONS).join(', ')}.`,
        ExitCode.USAGE,
      );
    }
    if (seen.has(direction)) {
      throw new CLIError(
        `Model "${model}" does not allow duplicate --multi-view-image entries for "${direction}".`,
        ExitCode.USAGE,
      );
    }
    seen.add(direction);

    if (value.startsWith('base64:')) {
      const base64 = value.slice('base64:'.length);
      if (base64.length === 0) {
        throw new CLIError(
          `Model "${model}" requires non-empty base64 content in --multi-view-image.`,
          ExitCode.USAGE,
        );
      }
      return { View: direction, ImageBase64: base64 };
    }

    return { View: direction, ImageUrl: value };
  });
}

function parseProMultiViewImages(model: string, flags: GlobalFlags): string[] | undefined {
  const specs = maybeStringArray(flags.multiViewImages);
  if (specs.length === 0) return undefined;

  return specs.map((spec) => {
    const separator = spec.indexOf('=');
    if (separator > 0) {
      const maybeDirection = spec.slice(0, separator).toLowerCase();
      if (MULTI_VIEW_DIRECTIONS.has(maybeDirection)) {
        throw new CLIError(
          `Model "${model}" requires each --multi-view-image to be a raw URL or base64 string without a view prefix.`,
          ExitCode.USAGE,
        );
      }
    }
    if (spec.length === 0) {
      throw new CLIError(
        `Model "${model}" requires non-empty --multi-view-image values.`,
        ExitCode.USAGE,
      );
    }
    return spec;
  });
}

registerProvider({
  provider: 'tencent',
  category: '3d',
  models: TENCENT_3D_MODELS,
  requiresPrompt(model: string): boolean {
    return !TENCENT_3D_MODELS.includes(model as typeof TENCENT_3D_MODELS[number]);
  },
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const params: Record<string, unknown> = collectPrimaryInput(model, prompt, flags);

    assertNoFlag(model, flags.imageUrls, 'image-urls');
    assertNoFlag(model, flags.modelVersion, 'model-version');
    assertNoFlag(model, flags.modelSeed, 'model-seed');
    assertNoFlag(model, flags.faceLimit, 'face-limit');
    assertNoFlag(model, flags.texture, 'texture');
    assertNoFlag(model, flags.pbr, 'pbr');
    assertNoFlag(model, flags.textureSeed, 'texture-seed');
    assertNoFlag(model, flags.textureAlignment, 'texture-alignment');
    assertNoFlag(model, flags.textureQuality, 'texture-quality');
    assertNoFlag(model, flags.autoSize, 'auto-size');
    assertNoFlag(model, flags.style, 'style');
    assertNoFlag(model, flags.orientation, 'orientation');
    assertNoFlag(model, flags.quad, 'quad');
    assertNoFlag(model, flags.compress, 'compress');
    assertNoFlag(model, flags.smartLowPoly, 'smart-low-poly');
    assertNoFlag(model, flags.generateParts, 'generate-parts');
    assertNoFlag(model, flags.geometryQuality, 'geometry-quality');

    if (flags.enablePbr !== undefined) {
      params['enable_pbr'] = flags.enablePbr as boolean;
    }

    if (BASE_MODELS.has(model)) {
      const resultFormat = parseResultFormat(model, flags);
      if (resultFormat) params['result_format'] = resultFormat;

      const multiViewImages = parseBaseMultiViewImages(model, flags);
      if (multiViewImages) params['multi_view_images'] = multiViewImages;

      assertNoFlag(model, flags.faceCount, 'face-count');
      assertNoFlag(model, flags.generateType, 'generate-type');
      assertNoFlag(model, flags.polygonType, 'polygon-type');
      return buildEnvelope(model, params);
    }

    if (PRO_MODELS.has(model)) {
      assertNoFlag(model, flags.resultFormat, 'result-format');

      const faceCount = parseFaceCount(model, flags);
      if (faceCount !== undefined) params['face_count'] = faceCount;

      const generateType = parseGenerateType(model, flags);
      if (generateType) params['generate_type'] = generateType;

      const polygonType = parsePolygonType(model, flags);
      if (polygonType) params['polygon_type'] = polygonType;

      const multiViewImages = parseProMultiViewImages(model, flags);
      if (multiViewImages) params['multi_view_images'] = multiViewImages;

      return buildEnvelope(model, params);
    }

    if (RAPID_MODELS.has(model)) {
      const resultFormat = parseResultFormat(model, flags);
      if (resultFormat) params['result_format'] = resultFormat;

      assertNoFlag(model, flags.faceCount, 'face-count');
      assertNoFlag(model, flags.generateType, 'generate-type');
      assertNoFlag(model, flags.polygonType, 'polygon-type');
      assertNoFlag(model, flags.multiViewImages, 'multi-view-image');

      return buildEnvelope(model, params);
    }

    throw new CLIError(`Unsupported Tencent 3D model "${model}".`, ExitCode.USAGE);
  },
});
