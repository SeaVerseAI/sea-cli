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

export const DEFAULT_AUDIO_MODEL = 'lyria_3_pro_preview';

const MINIMAX_ONLY_FLAGS: Array<[string, string]> = [
  ['minimaxModel', 'minimax-model'],
  ['sampleRate', 'sample-rate'],
  ['bitrate', 'bitrate'],
  ['format', 'format'],
  ['channel', 'channel'],
  ['lyricsOptimizer', 'lyrics-optimizer'],
  ['instrumental', 'instrumental'],
  ['watermark', 'watermark'],
  ['voiceId', 'voice-id'],
  ['voiceSpeed', 'voice-speed'],
  ['voiceVolume', 'voice-volume'],
  ['voicePitch', 'voice-pitch'],
  ['voiceEmotion', 'voice-emotion'],
  ['textNormalization', 'text-normalization'],
  ['latexRead', 'latex-read'],
  ['languageBoost', 'language-boost'],
  ['pronunciationDict', 'pronunciation-dict'],
  ['timbreWeights', 'timbre-weights'],
  ['voiceEffectPitch', 'voice-effect-pitch'],
  ['voiceEffectIntensity', 'voice-effect-intensity'],
  ['voiceEffectTimbre', 'voice-effect-timbre'],
  ['soundEffects', 'sound-effects'],
  ['subtitleEnable', 'subtitle-enable'],
  ['outputFormat', 'output-format'],
];

const MUREKA_ONLY_FLAGS: Array<[string, string]> = [
  ['murekaModel', 'mureka-model'],
  ['n', 'n'],
  ['referenceId', 'reference-id'],
  ['vocalId', 'vocal-id'],
  ['melodyId', 'melody-id'],
];

const KLING_ONLY_FLAGS: Array<[string, string]> = [
  ['videoUrl', 'video-url'],
  ['videoId', 'video-id'],
  ['soundEffectPrompt', 'sound-effect-prompt'],
  ['bgmPrompt', 'bgm-prompt'],
  ['asmrMode', 'asmr-mode'],
  ['externalTaskId', 'external-task-id'],
];

function rejectProviderSpecificFlags(model: string, provider: string, flags: GlobalFlags): void {
  const reject = (entries: Array<[string, string]>) => {
    for (const [key, flagName] of entries) {
      if (flags[key] !== undefined) {
        throw new CLIError(
          `Model "${model}" does not support --${flagName}.`,
          ExitCode.USAGE,
        );
      }
    }
  };

  if (provider !== 'minimax') reject(MINIMAX_ONLY_FLAGS);
  if (model !== 'mureka_song_generator') reject(MUREKA_ONLY_FLAGS);
  if (model !== 'kling_video_to_audio') reject(KLING_ONLY_FLAGS);

  if (provider !== 'minimax' && model !== 'mureka_song_generator' && flags.lyrics !== undefined) {
    throw new CLIError(
      `Model "${model}" does not support --lyrics.`,
      ExitCode.USAGE,
    );
  }
}

export default defineCommand({
  name: 'generate audio',
  description: 'Generate audio / music / speech via Lyria, Mureka, MiniMax, or other registered providers',
  usage: 'sac generate audio [--model <model>] [--prompt <text>] [flags]',
  options: [
    { flag: '--prompt <text>',             description: 'Audio, music, or speech text (required for prompt-driven models)', required: true },
    { flag: '--model <model>',             description: 'Built-in shortcut model ID. For gateway-only models, use `sac model search` + `sac generate submit`.' },
    { flag: '--list-models',               description: 'List all available audio models grouped by provider', type: 'boolean' },
    { flag: '--provider <name>',           description: 'Filter --list-models output by provider name' },
    // Mureka
    { flag: '--lyrics <text>',             description: 'Song lyrics when supported (required for mureka_song_generator)' },
    { flag: '--mureka-model <model>',      description: 'Mureka model variant (auto/mureka-7.5/mureka-9 etc.)' },
    { flag: '--minimax-model <model>',     description: 'MiniMax internal model variant when supported (music generation / t2a)' },
    { flag: '--n <count>',                 description: 'Number of outputs (mureka)', type: 'number' },
    { flag: '--reference-id <id>',         description: 'Reference music ID (mureka)' },
    { flag: '--vocal-id <id>',             description: 'Vocal ID (mureka)' },
    { flag: '--melody-id <id>',            description: 'Melody ID (mureka)' },
    { flag: '--lyrics-optimizer',          description: 'Auto-generate or optimize lyrics when supported (MiniMax music)', type: 'boolean' },
    { flag: '--instrumental',              description: 'Generate instrumental audio when supported (MiniMax music)', type: 'boolean' },
    { flag: '--sample-rate <n>',           description: 'Audio sample rate when supported', type: 'number' },
    { flag: '--bitrate <n>',               description: 'Audio bitrate when supported', type: 'number' },
    { flag: '--format <fmt>',              description: 'Audio format when supported, e.g. mp3, wav, pcm, flac' },
    { flag: '--channel <n>',               description: 'Audio channel count when supported', type: 'number' },
    { flag: '--output-format <fmt>',       description: 'MiniMax TTS output payload format: url or hex' },
    { flag: '--watermark',                 description: 'Enable provider watermark or audio mark when supported', type: 'boolean' },
    { flag: '--voice-id <id>',             description: 'Voice ID when supported (MiniMax TTS)' },
    { flag: '--voice-speed <n>',           description: 'Voice speed when supported', type: 'number' },
    { flag: '--voice-volume <n>',          description: 'Voice volume when supported', type: 'number' },
    { flag: '--voice-pitch <n>',           description: 'Voice pitch when supported', type: 'number' },
    { flag: '--voice-emotion <name>',      description: 'Voice emotion when supported (MiniMax TTS)' },
    { flag: '--text-normalization',        description: 'Enable text normalization when supported (MiniMax TTS)', type: 'boolean' },
    { flag: '--latex-read',                description: 'Read LaTeX formulas when supported (MiniMax TTS)', type: 'boolean' },
    { flag: '--language-boost <name>',     description: 'Language boost preset when supported (MiniMax TTS)' },
    { flag: '--pronunciation-dict <json>', description: 'Pronunciation dictionary JSON when supported (MiniMax TTS)' },
    { flag: '--timbre-weights <json>',     description: 'Voice-mix JSON array when supported (MiniMax TTS)' },
    { flag: '--voice-effect-pitch <n>',    description: 'Voice effect pitch adjustment when supported', type: 'number' },
    { flag: '--voice-effect-intensity <n>', description: 'Voice effect intensity adjustment when supported', type: 'number' },
    { flag: '--voice-effect-timbre <n>',   description: 'Voice effect timbre adjustment when supported', type: 'number' },
    { flag: '--sound-effects <name>',      description: 'Voice effect preset when supported (MiniMax TTS)' },
    { flag: '--subtitle-enable',           description: 'Enable subtitle output when supported (MiniMax TTS)', type: 'boolean' },
    // Kling audio / video-to-audio
    { flag: '--video-url <url>',           description: 'Input video URL when supported' },
    { flag: '--video-id <id>',             description: 'Input video task or asset ID when supported' },
    { flag: '--sound-effect-prompt <text>', description: 'Sound effect prompt when supported' },
    { flag: '--bgm-prompt <text>',         description: 'Background music prompt when supported' },
    { flag: '--asmr-mode',                 description: 'Enable ASMR mode when supported', type: 'boolean' },
    { flag: '--external-task-id <id>',     description: 'External task ID when supported by the upstream provider' },
    // Output
    { flag: '--out-dir <dir>',             description: 'Download generated files to this directory' },
    { flag: '--out-prefix <prefix>',       description: 'Filename prefix for downloads (default: audio)' },
    { flag: '--async',                     description: 'Return task ID immediately without polling', type: 'boolean' },
  ],
  examples: [
    'sac generate audio --list-models',
    'sac generate audio --prompt "Upbeat electronic music"',
    'sac generate audio --prompt "Upbeat electronic music" --model lyria_3_pro_preview',
    'sac generate audio --prompt "Chill lo-fi beat" --model mureka_song_generator --lyrics "..."',
    'sac generate audio --prompt "Pop song" --model mureka_song_generator --lyrics "..." --mureka-model mureka-7.5',
    'sac generate audio --model kling_video_to_audio --video-url https://example.com/clip.mp4 --sound-effect-prompt "rain and city ambience"',
    'sac generate audio --prompt "indie folk, wistful, warm guitar" --model minimax_music_25_plus --instrumental --format wav',
    'sac generate audio --prompt "你好，这是一段旁白" --model minimax_t2a --voice-id female-chengshu --voice-speed 1.1 --output-format url',
    'sac generate audio --prompt "Jazz" --model lyria_3_pro_preview --async',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    // --list-models
    if (flags.listModels) {
      const byProvider = modelsByProvider('audio');
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

    const model = (flags.model as string | undefined) ?? DEFAULT_AUDIO_MODEL;

    const providerDef = getProvider(model);
    if (!providerDef) {
      throw new CLIError(
        `Unknown built-in audio model "${model}". If this model exists in the gateway, run \`sac model search --query ${model}\`, inspect it with \`sac model get <model-id>\`, then call it with \`sac generate submit --body-json ...\`. Use \`sac generate audio --list-models\` only for built-in shortcuts.`,
        ExitCode.USAGE,
      );
    }

    if (providerDef.category !== 'audio') {
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
        const hint = await promptText({ message: 'Enter your audio prompt:' });
        if (!hint) { process.stderr.write('Cancelled.\n'); process.exit(1); }
        prompt = hint;
      } else {
        failIfMissing('prompt', 'sac generate audio [--model <model>] --prompt <text>');
      }
    }

    const body = providerDef.buildBody(model, prompt ?? '', flags);
    rejectUnsupportedContentSafety(flags, 'audio');

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
      defaultPrefix: 'audio',
      detectExtension: (url) => url.includes('.wav') ? 'wav' : 'mp3',
    });
  },
});
