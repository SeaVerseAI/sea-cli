import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

export const SEAART_MODELS = [
  'sdxl',
  'z_image',
  'z_image_turbo',
] as const;

const SDXL_VER = 'c9090ffbe5649de2f34cfe5b865d50fe';

/** Default model_ver_no per model. Override with --model-ver-no. */
export const DEFAULT_MODEL_VER: Partial<Record<string, string>> = {
  sdxl:          SDXL_VER,
  z_image:       SDXL_VER,
  z_image_turbo: SDXL_VER,
};

/** Models that require a `denoise` field (z_image family). */
const DENOISE_MODELS = new Set(['z_image', 'z_image_turbo']);

registerProvider({
  provider: 'seaart',
  category: 'image',
  models: SEAART_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const action = (flags.action as number | undefined) ?? (flags.imageUrl ? 1 : 0);

    const params: Record<string, unknown> = {
      prompt,
      n_iter: (flags.n as number | undefined) ?? 1,
      action,
    };

    const modelVerNo = (flags.modelVerNo as string | undefined) ?? DEFAULT_MODEL_VER[model];
    if (modelVerNo) params.model_ver_no = modelVerNo;
    if (flags.width)              params.width           = flags.width as number;
    if (flags.height)             params.height          = flags.height as number;
    if (flags.steps)              params.steps           = flags.steps as number;
    if (flags.seed !== undefined) params.seed            = flags.seed as number;
    if (flags.cfgScale !== undefined) params.cfg_scale   = flags.cfgScale as number;
    if (flags.negativePrompt)     params.negative_prompt = flags.negativePrompt as string;
    if (DENOISE_MODELS.has(model)) params.denoise = (flags.denoise as number | undefined) ?? 0.7;

    const inputItem: Record<string, unknown> = { params };
    if (flags.imageUrl) {
      inputItem.content = [{ type: 'image', url: flags.imageUrl as string }];
    }

    return {
      model,
      dash_scope: true,
      moderation: true,
      input: [inputItem],
      metadata: {},
    };
  },
});
