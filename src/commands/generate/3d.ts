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
import { printGenerationResult, rejectUnsupportedContentSafety } from './results';

// Importing registry triggers provider registration side-effects
import { getProvider, modelsByProvider } from './providers/registry';

interface GenerationCreateResponse {
  id: string;
  status: string;
  created_at?: number;
  error?: unknown;
}

export const DEFAULT_3D_TEXT_MODEL = 'tripo3d_text_to_model';
export const DEFAULT_3D_IMAGE_MODEL = 'tripo3d_image_to_model';
export const DEFAULT_3D_MULTIVIEW_MODEL = 'tripo3d_multiview_to_model';

function detect3dExtension(url: string): string {
  const match = url.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext && ['glb', 'obj', 'stl', 'usdz', 'fbx', 'mp4'].includes(ext)) {
    return ext;
  }
  return 'glb';
}

function detectDefault3dModel(flags: GlobalFlags): string | undefined {
  const prompt = typeof flags.prompt === 'string' && flags.prompt.length > 0;
  const imageUrl = typeof flags.imageUrl === 'string' && flags.imageUrl.length > 0;
  const imageUrls = Array.isArray(flags.imageUrls)
    ? flags.imageUrls.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  if (imageUrls.length > 0 && !imageUrl && !prompt) return DEFAULT_3D_MULTIVIEW_MODEL;
  if (imageUrl && !prompt && imageUrls.length === 0) return DEFAULT_3D_IMAGE_MODEL;
  if (prompt && !imageUrl && imageUrls.length === 0) return DEFAULT_3D_TEXT_MODEL;
  return undefined;
}

export default defineCommand({
  name: 'generate 3d',
  description: 'Generate 3D models via registered providers',
  usage: 'sac generate 3d [--model <model>] [--prompt <text> | --image-url <url> | --image-base64 <data> | --image-urls <url>...] [flags]',
  options: [
    { flag: '--prompt <text>',      description: '3D prompt (required for prompt-driven models)' },
    { flag: '--model <model>',      description: 'Built-in shortcut model ID. For gateway-only models, use `sac model search` + `sac generate submit`.' },
    { flag: '--list-models',        description: 'List all available 3D models grouped by provider', type: 'boolean' },
    { flag: '--provider <name>',    description: 'Filter --list-models output by provider name' },
    { flag: '--image-url <url>',    description: 'Input image URL' },
    { flag: '--image-urls <url>',   description: 'Repeatable input image URL. Tripo3D multiview uses exactly 4 items ordered as front, left, back, right.', type: 'array' },
    { flag: '--image-base64 <data>', description: 'Base64 input image for Tencent 3D models' },
    { flag: '--multi-view-image <spec>', description: 'Repeatable multi-view image. Tencent Hunyuan 3D uses <left|right|back>=<url|base64:data>; Pro uses raw values.', type: 'array' },
    { flag: '--result-format <fmt>', description: 'Tencent 3D output format: OBJ, GLB, STL, USDZ, FBX, MP4' },
    { flag: '--enable-pbr',         description: 'Enable PBR material generation for Tencent 3D models', type: 'boolean' },
    { flag: '--face-count <n>',     description: 'Tencent Hunyuan 3D Pro face count (40000-1500000)', type: 'number' },
    { flag: '--generate-type <type>', description: 'Tencent Hunyuan 3D Pro style: Normal, LowPoly, Geometry, Sketch' },
    { flag: '--polygon-type <type>', description: 'Tencent Hunyuan 3D Pro polygon type: triangle or quadrilateral' },
    { flag: '--model-version <ver>', description: 'Tripo3D model version' },
    { flag: '--model-seed <n>',     description: 'Tripo3D model seed', type: 'number' },
    { flag: '--face-limit <n>',     description: 'Tripo3D face limit', type: 'number' },
    { flag: '--texture <0|1>',      description: 'Tripo3D texture toggle: 1 enable, 0 disable', type: 'number' },
    { flag: '--pbr <0|1>',          description: 'Tripo3D PBR material toggle: 1 enable, 0 disable', type: 'number' },
    { flag: '--texture-seed <n>',   description: 'Tripo3D texture seed', type: 'number' },
    { flag: '--texture-alignment <mode>', description: 'Tripo3D texture alignment: original_image or geometry' },
    { flag: '--texture-quality <mode>', description: 'Tripo3D texture quality: standard or detailed' },
    { flag: '--auto-size <0|1>',    description: 'Tripo3D auto-size toggle: 1 enable, 0 disable', type: 'number' },
    { flag: '--style <style>',      description: 'Tripo3D style preset when supported' },
    { flag: '--orientation <dir>',  description: 'Tripo3D orientation when supported' },
    { flag: '--quad <0|1>',         description: 'Tripo3D quad-mesh toggle: 1 enable, 0 disable', type: 'number' },
    { flag: '--compress <mode>',    description: 'Tripo3D compression mode' },
    { flag: '--smart-low-poly <0|1>', description: 'Tripo3D smart low poly toggle: 1 enable, 0 disable', type: 'number' },
    { flag: '--generate-parts <0|1>', description: 'Tripo3D parts generation toggle: 1 enable, 0 disable', type: 'number' },
    { flag: '--geometry-quality <mode>', description: 'Tripo3D geometry quality: standard or detailed' },
    { flag: '--out-dir <dir>',      description: 'Download generated files to this directory' },
    { flag: '--out-prefix <prefix>', description: 'Filename prefix for downloads (default: model)' },
    { flag: '--async',              description: 'Return task ID immediately without polling', type: 'boolean' },
  ],
  examples: [
    'sac generate 3d --list-models',
    'sac generate 3d --list-models --provider volces',
    'sac generate 3d --prompt "a stylized toy robot"',
    'sac generate 3d --image-url https://example.com/object.png',
    'sac generate 3d --image-urls https://example.com/front.png --image-urls https://example.com/left.png --image-urls https://example.com/back.png --image-urls https://example.com/right.png --texture 0 --pbr 0',
    'sac generate 3d --model volces_seed3d --prompt "a stylized ceramic cat figurine" --image-url https://example.com/cat.png',
    'sac generate 3d --model tencent_hunyuan_3d --prompt "a carved jade dragon" --result-format GLB --enable-pbr',
    'sac generate 3d --model tencent_hunyuan_3d_pro --image-url https://example.com/object.png --face-count 80000 --generate-type LowPoly',
    'sac generate 3d --model tripo3d_text_to_model --prompt "a stylized toy robot" --style low_poly --orientation front',
    'sac generate 3d --model tripo3d_multiview_to_model --image-urls https://example.com/front.png --image-urls https://example.com/left.png --image-urls https://example.com/back.png --image-urls https://example.com/right.png --texture 0 --pbr 0 --generate-parts 1',
    'sac generate 3d --model volces_seed3d --prompt "a toy robot" --image-url https://example.com/robot.png --async',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    if (flags.listModels) {
      const byProvider = modelsByProvider('3d');
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

    const model = (flags.model as string | undefined) ?? detectDefault3dModel(flags);
    if (!model) {
      failIfMissing(
        'model',
        'sac generate 3d [--model <model>] --prompt <text> | --image-url <url> | --image-urls <url>...',
      );
    }

    const providerDef = getProvider(model);
    if (!providerDef) {
      throw new CLIError(
        `Unknown built-in 3D model "${model}". If this model exists in the gateway, run \`sac model search --query ${model}\`, inspect it with \`sac model get <model-id>\`, then call it with \`sac generate submit --body-json ...\`. Use \`sac generate 3d --list-models\` only for built-in shortcuts.`,
        ExitCode.USAGE,
      );
    }

    if (providerDef.category !== '3d') {
      throw new CLIError(
        `Model "${model}" is a ${providerDef.category} model. Use \`sac generate ${providerDef.category}\` instead.`,
        ExitCode.USAGE,
      );
    }

    const requiresPrompt = providerDef.requiresPrompt ? providerDef.requiresPrompt(model) : true;

    let prompt = flags.prompt as string | undefined;
    if (!prompt && requiresPrompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: 'Enter your 3D prompt:' });
        if (!hint) { process.stderr.write('Cancelled.\n'); process.exit(1); }
        prompt = hint;
      } else {
        failIfMissing('prompt', 'sac generate 3d [--model <model>] --prompt <text>');
      }
    }

    const body = providerDef.buildBody(model, prompt ?? '', flags);
    rejectUnsupportedContentSafety(flags, '3d');

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
      defaultPrefix: 'model',
      detectExtension: detect3dExtension,
    });
  },
});
