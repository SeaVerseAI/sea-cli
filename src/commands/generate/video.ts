import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { requestJson } from '../../client/http';
import { generationEndpoint } from '../../client/endpoints';
import { pollTask } from '../../polling/poll';
import { downloadFile } from '../../files/download';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { isInteractive } from '../../utils/env';
import { promptText, failIfMissing } from '../../utils/prompt';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import { buildProviderModelsList } from './model-list';

// Importing registry triggers provider registration side-effects
import { getProvider, modelsByProvider } from './providers/registry';

interface GenerationCreateResponse {
  id: string;
  status: string;
  created_at?: number;
  error?: unknown;
}

export const DEFAULT_VIDEO_MODEL = 'volces_seedance_1_5_pro';

const PIXVERSE_ONLY_FLAGS: Array<[string, string]> = [
  ['motionMode', 'motion-mode'],
  ['cameraMovement', 'camera-movement'],
  ['templateId', 'template-id'],
  ['soundEffect', 'sound-effect'],
  ['soundEffectPrompt', 'sound-effect-prompt'],
  ['lipSync', 'lip-sync'],
  ['ttsText', 'tts-text'],
  ['thinkingType', 'thinking-type'],
  ['referenceNames', 'reference-names'],
  ['referenceTypes', 'reference-types'],
];

function rejectProviderSpecificFlags(model: string, provider: string, flags: GlobalFlags): void {
  if (provider === 'pixverse') return;

  for (const [key, flagName] of PIXVERSE_ONLY_FLAGS) {
    if (flags[key] !== undefined) {
      throw new CLIError(
        `Model "${model}" does not support --${flagName}.`,
        ExitCode.USAGE,
      );
    }
  }
}

export default defineCommand({
  name: 'generate video',
  description: 'Generate videos via Vidu, Kling, Alibaba, or other registered providers',
  usage: 'sac generate video [--model <model>] [--prompt <text>] [flags]',
  options: [
    { flag: '--prompt <text>',             description: 'Video description (required for prompt-driven models)', required: true },
    { flag: '--model <model>',             description: 'Built-in shortcut model ID. For gateway-only models, use `sac model search` + `sac generate submit`.' },
    { flag: '--list-models',               description: 'List all available video models grouped by provider', type: 'boolean' },
    { flag: '--provider <name>',           description: 'Filter --list-models output by provider name' },
    // Common video
    { flag: '--duration <n>',              description: 'Video duration in seconds', type: 'number' },
    { flag: '--aspect-ratio <ratio>',      description: 'Aspect ratio, e.g. "16:9", "9:16", "1:1"' },
    { flag: '--resolution <res>',          description: 'Resolution preset, e.g. "720p", "1080p", "1K", "2K", or Tencent SR definitions like "720P", "1080P", "2K", "4K"' },
    { flag: '--prompt-optimizer <true|false>', description: 'Override prompt optimization when supported' },
    { flag: '--fast-pretreatment',         description: 'Enable fast pretreatment when supported', type: 'boolean' },
    { flag: '--seed <n>',                  description: 'Random seed', type: 'number' },
    { flag: '--short <0|1>',               description: 'Tencent MPS short-video hint: 0 or 1', type: 'number' },
    { flag: '--size <size>',               description: 'Size string (Alibaba t2v), e.g. "1280x720"' },
    { flag: '--motion-mode <mode>',        description: 'Motion mode when supported, e.g. "normal" or "fast" (PixVerse legacy models)' },
    { flag: '--camera-movement <type>',    description: 'Camera movement when supported, e.g. "zoom_in" or "pan_left" (PixVerse legacy models)' },
    { flag: '--template-id <id>',          description: 'Template ID when supported (PixVerse)', type: 'number' },
    { flag: '--fps <n>',                   description: 'Video frames per second', type: 'number' },
    { flag: '--frames <n>',                description: 'Video frame count (Volces SeeDance Pro Fast)', type: 'number' },
    { flag: '--service-tier <tier>',       description: 'Service tier, e.g. "default" or "flex" (Volces)' },
    { flag: '--expires-after <sec>',       description: 'Task expiration timeout in seconds (Volces)', type: 'number' },
    { flag: '--style <style>',             description: 'Style preset when supported (Vidu Q1: general or anime)' },
    { flag: '--payload <text>',            description: 'Opaque payload passthrough when supported (Vidu)' },
    { flag: '--callback-url <url>',        description: 'Callback URL when supported (Vidu)' },
    { flag: '--off-peak',                  description: 'Enable off-peak queueing when supported (Vidu)', type: 'boolean' },
    { flag: '--recommend-prompt',          description: 'Use provider-generated prompt recommendation when supported (Vidu)', type: 'boolean' },
    { flag: '--enhance-prompt',            description: 'Enable prompt enhancement when supported (Vidu Q3 mix reference)', type: 'boolean' },
    { flag: '--template <name>',           description: 'Template name when supported (Vidu templates)' },
    { flag: '--template-params <json>',    description: 'JSON object for template-specific extra parameters (Vidu templates)' },
    { flag: '--language <lang>',           description: 'Language when supported, e.g. zh or en (Vidu ad one-click)' },
    { flag: '--creative',                  description: 'Enable creative mode when supported (Vidu ad one-click)', type: 'boolean' },
    { flag: '--add-subtitle',              description: 'Add subtitles when supported (Vidu one-click MV)', type: 'boolean' },
    { flag: '--remove-audio',              description: 'Remove original video audio when supported (Vidu trending replicate)', type: 'boolean' },
    { flag: '--watermark',                 description: 'Enable watermark output when supported', type: 'boolean' },
    { flag: '--watermark-position <n>',    description: 'Watermark position when supported: 1-4 (Vidu)', type: 'number' },
    { flag: '--watermark-url <url>',       description: 'Watermark image URL when supported (Vidu)' },
    { flag: '--meta-data <json>',          description: 'Metadata JSON string when supported (Vidu)' },
    { flag: '--external-task-id <id>',     description: 'External task ID when supported by the upstream provider' },
    { flag: '--element-ids <id>',          description: 'Reference element IDs (repeat flag, Kling omni models)', type: 'array' },
    { flag: '--effect-scene <scene>',      description: 'Effect scene name for Kling video effects models' },
    { flag: '--character-orientation <v>', description: 'Character orientation for Kling motion control: image or video' },
    { flag: '--keep-original-sound <v>',   description: 'Keep reference video audio when supported: yes or no' },
    { flag: '--video-refer-type <type>',   description: 'Reference video type when supported: feature or base' },
    { flag: '--lipsync-mode <mode>',       description: 'Kling lipsync mode: text2video or audio2video' },
    { flag: '--camera-fixed',              description: 'Fix camera movement when supported', type: 'boolean' },
    { flag: '--return-last-frame',         description: 'Return last frame image when supported', type: 'boolean' },
    { flag: '--draft',                     description: 'Enable draft mode when supported', type: 'boolean' },
    // Input images
    { flag: '--image-url <url>',           description: 'First-frame image URL (i2v)' },
    { flag: '--image-tail-url <url>',      description: 'Last-frame image URL (kling i2v)' },
    { flag: '--image-urls <url>',          description: 'Multiple input image URLs (repeat flag)', type: 'array' },
    { flag: '--character-reference-url <url>', description: 'Character reference image URL when supported (Vidu Q3 mix reference)' },
    { flag: '--style-reference-url <url>', description: 'Style reference image URL when supported (Vidu Q3 mix reference)' },
    { flag: '--character-reference-weight <n>', description: 'Character reference weight [0,1] when supported (Vidu Q3 mix reference)', type: 'number' },
    { flag: '--style-reference-weight <n>', description: 'Style reference weight [0,1] when supported (Vidu Q3 mix reference)', type: 'number' },
    { flag: '--reference-urls <url>',      description: 'Reference file URLs (repeat flag, Alibaba reference)', type: 'array' },
    { flag: '--video-url <url>',           description: 'Input or reference video URL when supported' },
    { flag: '--video-id <id>',             description: 'Upstream video asset or task ID when supported' },
    { flag: '--draft-task-id <id>',        description: 'Draft task ID for volces_draft_video' },
    { flag: '--mask-urls <url>',           description: 'Mask image URLs (repeat flag, Volces avatar v1.5)', type: 'array' },
    // Motion / quality
    { flag: '--movement-amplitude <val>',  description: 'Motion amount: auto/small/medium/large (Vidu)' },
    { flag: '--mode <mode>',               description: 'Generation mode, e.g. "pro", "std" (Kling)' },
    { flag: '--shot-type <type>',          description: 'Shot type, e.g. "single"/"multi" (Alibaba t2v); "customize" when --multi-shot (Kling)' },
    { flag: '--multi-shot',                description: 'Enable multi-scene video (Kling t2v and i2v)', type: 'boolean' },
    { flag: '--negative-prompt <text>',    description: 'Negative prompt (Kling)' },
    { flag: '--cfg-scale <n>',             description: 'CFG / guidance scale (Kling)', type: 'number' },
    { flag: '--video-quality <mode>',      description: 'Video quality mode when supported, e.g. "normal"/"high" (Volces) or provider-specific quality values' },
    { flag: '--pe-fast-mode',              description: 'Enable fast mode (Volces avatar v1.5)', type: 'boolean' },
    { flag: '--thinking-type <type>',      description: 'Reasoning mode when supported, e.g. "enabled", "disabled", or "auto" (PixVerse)' },
    // Audio
    { flag: '--audio',                     description: 'Enable audio output', type: 'boolean' },
    { flag: '--audio-id <id>',             description: 'Upstream audio/voice asset ID when supported' },
    { flag: '--voice-id <id>',             description: 'Voice ID when supported (Kling lipsync text2video)' },
    { flag: '--voice-language <lang>',     description: 'Voice language when supported, e.g. zh or en' },
    { flag: '--voice-speed <n>',           description: 'Voice speed when supported', type: 'number' },
    { flag: '--bgm',                       description: 'Add background music (Vidu)', type: 'boolean' },
    { flag: '--sound <on|off>',            description: 'Audio switch (Kling)' },
    { flag: '--sound-effect',              description: 'Enable sound effects when supported (PixVerse)', type: 'boolean' },
    { flag: '--sound-effect-prompt <text>', description: 'Sound effect description when supported (PixVerse)' },
    { flag: '--lip-sync',                  description: 'Enable lip sync when supported (PixVerse)', type: 'boolean' },
    { flag: '--tts-text <text>',           description: 'Lip-sync TTS text when supported (PixVerse)' },
    { flag: '--audio-url <url>',           description: 'Audio URL when supported (Alibaba t2v, Kling avatar, etc.)' },
    { flag: '--sounds <url>',              description: 'Reference audio URLs (repeat flag, Vidu reference)', type: 'array' },
    { flag: '--bitrate <n>',               description: 'Target bitrate when supported', type: 'number' },
    { flag: '--extension-type <type>',     description: 'Video extension direction when supported: forward/backward/both' },
    { flag: '--reference-names <name>',    description: 'Reference names for repeat image inputs when supported (repeat flag, PixVerse Fusion)', type: 'array' },
    { flag: '--reference-types <type>',    description: 'Reference types for repeat image inputs when supported: subject or background (repeat flag, PixVerse Fusion)', type: 'array' },
    // Output
    { flag: '--out-dir <dir>',             description: 'Download generated files to this directory' },
    { flag: '--out-prefix <prefix>',       description: 'Filename prefix for downloads (default: video)' },
    { flag: '--async',                     description: 'Return task ID immediately without polling', type: 'boolean' },
  ],
  examples: [
    'sac generate video --list-models',
    'sac generate video --list-models --provider vidu',
    'sac generate video --prompt "A sunset timelapse"',
    'sac generate video --prompt "A sunset timelapse" --model vidu_q3_pro',
    'sac generate video --prompt "Animate this photo" --model vidu_q3_pro_i2v --image-url https://example.com/photo.jpg',
    'sac generate video --model vidu_q3_pro_start_end --image-url https://example.com/start.jpg --image-tail-url https://example.com/end.jpg --duration 5',
    'sac generate video --model vidu_template_v2 --template turn_into_zombie --image-url https://example.com/person.jpg',
    'sac generate video --model vidu_one_click_mv --image-urls https://example.com/model.jpg --audio-url https://example.com/song.mp3 --add-subtitle',
    'sac generate video --prompt "a futuristic skyline at dusk" --model alibaba_wan27_t2v --resolution 1080P --aspect-ratio 16:9',
    'sac generate video --model alibaba_wan27_i2v --image-url https://example.com/photo.jpg --prompt "gentle cinematic movement"',
    'sac generate video --prompt "Ocean waves" --model kling_v3 --duration 5 --aspect-ratio 16:9',
    'sac generate video --prompt "Make it move" --model kling_v3_i2v --image-url https://example.com/photo.jpg',
    'sac generate video --model kling_avatar --image-url https://example.com/avatar.png --audio-url https://example.com/voice.mp3',
    'sac generate video --model kling_motion_control --image-url https://example.com/actor.png --video-url https://example.com/ref.mp4 --character-orientation image --mode std',
    'sac generate video --model kling_effects_multi_v15 --image-urls https://example.com/a.png --image-urls https://example.com/b.png --effect-scene hug --duration 5',
    'sac generate video --prompt "a toy robot waves to camera" --model kling_omni_video --aspect-ratio 16:9',
    'sac generate video --prompt "你好，欢迎来到 SeaArt" --model kling_lipsync --lipsync-mode text2video --video-url https://example.com/face.mp4 --voice-id voice_123 --voice-language zh',
    'sac generate video --model tencent_mps_super_resolution --video-url https://example.com/input.mp4 --resolution 1080P --short 1',
    'sac generate video --prompt "Mountain scene" --model alibaba_wanx26_t2v --async',
    'sac generate video --prompt "A fox in snow" --model volces_seedance_3_0 --resolution 720p',
    'sac generate video --prompt "cinematic city at night" --model minimax_hailuo_02 --duration 10 --resolution 768P --prompt-optimizer false',
    'sac generate video --model volces_seedance_30_i2v --image-url https://example.com/first-frame.jpg --prompt "gentle camera move"',
    'sac generate video --model volces_jimeng_dream_actor_m2 --image-url https://example.com/portrait.png --video-url https://example.com/template.mp4',
    'sac generate video --prompt "a robot walks into frame" --model pixverse_v6_t2v --aspect-ratio 16:9 --resolution 720p --audio',
    'sac generate video --model pixverse_v5_i2v --image-url https://example.com/photo.jpg --motion-mode fast --camera-movement zoom_in',
    'sac generate video --model pixverse_v5_6_fusion --prompt "@hero runs through the city" --image-url https://example.com/hero.jpg --reference-names hero --reference-types subject --aspect-ratio 16:9',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    // --list-models
    if (flags.listModels) {
      const byProvider = modelsByProvider('video');
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

    const model = (flags.model as string | undefined) ?? DEFAULT_VIDEO_MODEL;

    const providerDef = getProvider(model);
    if (!providerDef) {
      throw new CLIError(
        `Unknown built-in video model "${model}". If this model exists in the gateway, run \`sac model search --query ${model}\`, inspect it with \`sac model get <model-id>\`, then call it with \`sac generate submit --body-json ...\`. Use \`sac generate video --list-models\` only for built-in shortcuts.`,
        ExitCode.USAGE,
      );
    }

    if (providerDef.category !== 'video') {
      throw new CLIError(
        `Model "${model}" is a ${providerDef.category} model. Use \`sac generate ${providerDef.category}\` instead.`,
        ExitCode.USAGE,
      );
    }

    rejectProviderSpecificFlags(model, providerDef.provider, flags);

    const requiresPrompt = providerDef.requiresPrompt ? providerDef.requiresPrompt(model) : true;

    let prompt = flags.prompt as string | undefined;
    if (!prompt && requiresPrompt) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const hint = await promptText({ message: 'Enter your video prompt:' });
        if (!hint) { process.stderr.write('Cancelled.\n'); process.exit(1); }
        prompt = hint;
      } else {
        failIfMissing('prompt', 'sac generate video [--model <model>] --prompt <text>');
      }
    }

    const body = providerDef.buildBody(model, prompt ?? '', flags);

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

    const urls: string[] = [];
    for (const out of result.output ?? []) {
      for (const c of out.content ?? []) {
        if (c.url) urls.push(c.url);
      }
    }

    if (urls.length === 0) {
      console.log(formatOutput(result, format));
      return;
    }

    if (flags.outDir) {
      const outDir = flags.outDir as string;
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      const prefix = (flags.outPrefix as string) || 'video';
      const saved: string[] = [];

      for (let i = 0; i < urls.length; i++) {
        const ext = urls[i]!.includes('.mp4') ? 'mp4' : 'mp4';
        const filename = `${prefix}_${String(i + 1).padStart(3, '0')}.${ext}`;
        const destPath = join(outDir, filename);
        await downloadFile(urls[i]!, destPath, { quiet: config.quiet });
        saved.push(destPath);
      }

      console.log(formatOutput({ task_id: taskId, saved }, format));
    } else if (config.quiet && format === 'text') {
      console.log(urls.join('\n'));
    } else {
      console.log(formatOutput({ task_id: taskId, urls }, format));
    }
  },
});
