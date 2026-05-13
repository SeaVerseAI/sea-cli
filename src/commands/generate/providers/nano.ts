import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

// ── Model lists ──────────────────────────────────────────────────────────────

const IMAGE_MODELS = [
  'nano_banana_2',
] as const;

// ── Image generation ─────────────────────────────────────────────────────────

registerProvider({
  provider: 'nano',
  category: 'image',
  models: IMAGE_MODELS,
  buildBody(model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const params: Record<string, unknown> = { prompt };

    if (flags.aspectRatio) params['aspect_ratio'] = flags.aspectRatio as string;
    if (flags.resolution)  params['resolution']   = flags.resolution as string;

    const imageUrls = flags.imageUrls as string[] | string | undefined;
    if (imageUrls) {
      params['image_urls'] = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
    } else if (flags.imageUrl) {
      params['image_urls'] = [flags.imageUrl as string];
    }

    return {
      model,
      dash_scope: true,
      moderation: true,
      input: [{ params }],
      metadata: {},
    };
  },
});

// suppress unused
void CLIError;
void ExitCode;
