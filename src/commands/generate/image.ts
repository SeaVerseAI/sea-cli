import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { requestJson } from '../../client/http';
import { generationEndpoint } from '../../client/endpoints';
import { pollTask } from '../../polling/poll';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { isInteractive } from '../../utils/env';
import { promptText, failIfMissing } from '../../utils/prompt';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import { buildProviderModelsList } from './model-list';
import { printGenerationResult, rejectAsyncContentSafety } from './results';

// Importing registry triggers provider registration side-effects
import { getProvider, allModels, modelsByProvider, modelsByCategory } from './providers/registry';

interface GenerationCreateResponse {
  id: string;
  status: string;
  created_at?: number;
  error?: unknown;
}

export const DEFAULT_IMAGE_MODEL = 'volces_seedream_4_5';

export default defineCommand({
  name: 'generate image',
  description: 'Generate images via SeaArt, Volces, Alibaba, or other registered providers',
  usage: 'sac generate image --prompt <text> [flags]',
  options: [
    { flag: '--prompt <text>',             description: 'Image description (required)', required: true },
    { flag: '--model <model>',             description: 'Built-in shortcut model ID. For gateway-only models, use `sac model search` + `sac generate submit`.' },
    { flag: '--list-models',               description: 'List all available image models grouped by provider', type: 'boolean' },
    { flag: '--provider <name>',           description: 'Filter --list-models output by provider name' },
    // SeaArt
    { flag: '--model-ver-no <ver>',        description: 'Model version number (SeaArt models only)' },
    { flag: '--steps <n>',                 description: 'Inference steps (SeaArt models)', type: 'number' },
    { flag: '--cfg-scale <n>',             description: 'CFG / guidance scale (SeaArt models)', type: 'number' },
    { flag: '--denoise <n>',               description: 'Denoise strength [0,1] (z_image / z_image_turbo, default: 0.7)', type: 'number' },
    { flag: '--action <n>',                description: 'Action type (SeaArt): 0=t2i 1=i2i 3=t2i+cn 5=i2i+cn', type: 'number' },
    // Common image
    { flag: '--n <count>',                 description: 'Number of outputs (default: 1)', type: 'number' },
    { flag: '--width <px>',                description: 'Output width in pixels', type: 'number' },
    { flag: '--height <px>',               description: 'Output height in pixels', type: 'number' },
    { flag: '--size <size>',               description: 'Size string, e.g. "2048x2048", "2K", "1920*1080"' },
    { flag: '--aspect-ratio <ratio>',      description: 'Aspect ratio, e.g. "16:9", "9:16", "1:1"' },
    { flag: '--resolution <res>',          description: 'Resolution when supported, e.g. "1024:1024", "720p", "1080p", "2K"' },
    { flag: '--seed <n>',                  description: 'Random seed', type: 'number' },
    { flag: '--logo-add <0|1>',            description: 'Tencent explicit watermark switch: 1 add, 0 disable', type: 'number' },
    { flag: '--revise <0|1>',              description: 'Tencent prompt rewrite switch: 1 enable, 0 disable', type: 'number' },
    { flag: '--negative-prompt <text>',    description: 'Negative prompt' },
    { flag: '--watermark',                 description: 'Enable watermark output when supported', type: 'boolean' },
    { flag: '--external-task-id <id>',     description: 'External task ID when supported by the upstream provider' },
    { flag: '--image-url <url>',           description: 'Input image URL (i2i / reference)' },
    { flag: '--image-urls <url>',          description: 'Multiple input image URLs (repeat flag)', type: 'array' },
    { flag: '--element-ids <id>',          description: 'Reference element IDs (repeat flag, Kling)', type: 'array' },
    { flag: '--result-type <type>',        description: 'Image result type when supported: single or series' },
    { flag: '--series-amount <n>',         description: 'Series image count when supported', type: 'number' },
    { flag: '--scale <n>',                 description: 'Edit strength [0,1] (Volces edit models)', type: 'number' },
    { flag: '--template-id <id>',          description: 'Template ID for Volces style/template image models' },
    { flag: '--req-key <key>',             description: 'Volces style preset key for req_key-driven models' },
    { flag: '--sub-req-key <key>',         description: 'Volces sub-style key paired with --req-key' },
    { flag: '--ref-type <type>',           description: 'Reference type for each Volces multi-IP input image (repeat flag)', type: 'array' },
    { flag: '--gpen <n>',                  description: 'Portrait enhancement strength for volces_seededit_portrait', type: 'number' },
    { flag: '--skin <n>',                  description: 'Portrait beautify strength for volces_seededit_portrait', type: 'number' },
    { flag: '--skin-unifi <n>',            description: 'Portrait skin-evening strength for volces_seededit_portrait', type: 'number' },
    { flag: '--gen-mode <mode>',           description: 'Portrait generation mode for volces_seededit_portrait' },
    // Output
    { flag: '--out-dir <dir>',             description: 'Download generated files to this directory' },
    { flag: '--out-prefix <prefix>',       description: 'Filename prefix for downloads (default: image)' },
    { flag: '--content-safety',            description: 'Scan generated output URL(s) after polling completes', type: 'boolean' },
    { flag: '--async',                     description: 'Return task ID immediately without polling', type: 'boolean' },
  ],
  examples: [
    'sac generate image --list-models',
    'sac generate image --list-models --provider volces',
    'sac generate image --prompt "A cat in space"',
    'sac generate image --prompt "Portrait" --model sdxl --width 1024 --height 1024',
    'sac generate image --prompt "A cat in space" --model volces_seedream_5',
    'sac generate image --prompt "futuristic product photo" --model kling_v3_image --aspect-ratio 1:1',
    'sac generate image --prompt "futuristic product photo" --model alibaba_wan27_image --size 2K',
    'sac generate image --prompt "国风山水画" --model tencent_image_creation_3 --resolution 1024:1024 --logo-add 1 --revise 1',
    'sac generate image --prompt "a cat" --model volces_jimeng_3_1 --width 1664 --height 936',
    'sac generate image --prompt "make it anime" --model volces_seededit_3_0 --image-url https://example.com/img.jpg',
    'sac generate image --prompt "futuristic car" --model alibaba_wan27_image_pro --async',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    // --list-models
    if (flags.listModels) {
      const byProvider = modelsByProvider('image');
      const filterProvider = flags.provider as string | undefined;
      const providers = buildProviderModelsList(byProvider, filterProvider);
      if (format === 'json') {
        console.log(formatOutput({ providers }, format));
      } else {
        for (const { provider, models } of providers) {
          process.stdout.write(`\n[${provider}]\n`);
          for (const m of models) process.stdout.write(`  ${m}\n`);
        }
      }
      return;
    }

    const model = (flags.model as string) || config.defaultImageModel || DEFAULT_IMAGE_MODEL;

    const providerDef = getProvider(model);
    if (!providerDef) {
      throw new CLIError(
        `Unknown built-in image model "${model}". If this model exists in the gateway, run \`sac model search --query ${model}\`, inspect it with \`sac model get <model-id>\`, then call it with \`sac generate submit --body-json ...\`. Use \`sac generate image --list-models\` only for built-in shortcuts.`,
        ExitCode.USAGE,
      );
    }

    if (providerDef.category !== 'image') {
      throw new CLIError(
        `Model "${model}" is a ${providerDef.category} model. Use \`sac generate ${providerDef.category}\` instead.`,
        ExitCode.USAGE,
      );
    }

    const requiresPrompt = providerDef.requiresPrompt ? providerDef.requiresPrompt(model) : true;

    let prompt = flags.prompt as string | undefined;
    if (!prompt && requiresPrompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: 'Enter your image prompt:' });
        if (!hint) { process.stderr.write('Cancelled.\n'); process.exit(1); }
        prompt = hint;
      } else {
        failIfMissing('prompt', 'sac generate image --prompt <text>');
      }
    }

    const body = providerDef.buildBody(model, prompt ?? '', flags);
    rejectAsyncContentSafety(flags, config);

    if (config.dryRun) {
      console.log(formatOutput({ request: body }, format));
      return;
    }

    const url = generationEndpoint(config);

    if (!config.quiet) {
      process.stderr.write(`[${providerDef.provider}/${model}]\n`);
    }

    const createResp = await requestJson<GenerationCreateResponse>(config, {
      url,
      method: 'POST',
      body,
    });

    const taskId = createResp.id;
    if (!taskId) {
      throw new CLIError('No task ID returned from API.', ExitCode.GENERAL);
    }

    if (flags.async || config.async) {
      console.log(formatOutput({ task_id: taskId, status: createResp.status }, format));
      return;
    }

    const result = await pollTask(config, { taskId });
    await printGenerationResult(config, flags, format, {
      taskId,
      result,
      defaultPrefix: 'image',
      detectExtension: (url) => url.includes('.png') ? 'png' : 'webp',
    });
  },
});

// Re-export for tests and other commands that need the model list
export { allModels, modelsByProvider, modelsByCategory, getProvider };
