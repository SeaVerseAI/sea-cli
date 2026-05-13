import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

const VOLCES_3D_MODELS = [
  'volces_seed3d',
] as const;

function requireStringFlag(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CLIError(message, ExitCode.USAGE);
  }
  return value;
}

function buildContent(prompt: string, imageUrl: string): Record<string, unknown>[] {
  return [
    {
      type: 'text',
      text: prompt,
    },
    {
      type: 'image_url',
      image_url: { url: imageUrl },
    },
  ];
}

function assertUnsupported(model: string, value: unknown, flagName: string): void {
  if (value === undefined) return;
  throw new CLIError(
    `Model "${model}" does not support --${flagName}.`,
    ExitCode.USAGE,
  );
}

registerProvider({
  provider: 'volces',
  category: '3d',
  models: VOLCES_3D_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    if (!prompt) {
      throw new CLIError(
        `Model "${model}" requires --prompt.`,
        ExitCode.USAGE,
      );
    }

    const imageUrl = requireStringFlag(
      flags.imageUrl,
      `Model "${model}" requires --image-url.`,
    );

    assertUnsupported(model, flags.imageUrls, 'image-urls');
    assertUnsupported(model, flags.imageBase64, 'image-base64');
    assertUnsupported(model, flags.multiViewImages, 'multi-view-image');
    assertUnsupported(model, flags.resultFormat, 'result-format');
    assertUnsupported(model, flags.enablePbr, 'enable-pbr');
    assertUnsupported(model, flags.faceCount, 'face-count');
    assertUnsupported(model, flags.generateType, 'generate-type');
    assertUnsupported(model, flags.polygonType, 'polygon-type');
    assertUnsupported(model, flags.modelVersion, 'model-version');
    assertUnsupported(model, flags.modelSeed, 'model-seed');
    assertUnsupported(model, flags.faceLimit, 'face-limit');
    assertUnsupported(model, flags.texture, 'texture');
    assertUnsupported(model, flags.pbr, 'pbr');
    assertUnsupported(model, flags.textureSeed, 'texture-seed');
    assertUnsupported(model, flags.textureAlignment, 'texture-alignment');
    assertUnsupported(model, flags.textureQuality, 'texture-quality');
    assertUnsupported(model, flags.autoSize, 'auto-size');
    assertUnsupported(model, flags.style, 'style');
    assertUnsupported(model, flags.orientation, 'orientation');
    assertUnsupported(model, flags.quad, 'quad');
    assertUnsupported(model, flags.compress, 'compress');
    assertUnsupported(model, flags.smartLowPoly, 'smart-low-poly');
    assertUnsupported(model, flags.generateParts, 'generate-parts');
    assertUnsupported(model, flags.geometryQuality, 'geometry-quality');

    return {
      model,
      dash_scope: true,
      moderation: true,
      input: [
        {
          params: {
            content: buildContent(prompt, imageUrl),
          },
        },
      ],
      metadata: {},
    };
  },
});
