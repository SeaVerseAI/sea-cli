import { CLIError } from '../../../errors/base';
import { ExitCode } from '../../../errors/codes';
import type { GlobalFlags } from '../../../types/flags';
import { registerProvider } from './store';

// ── Model lists ──────────────────────────────────────────────────────────────

const MUSIC_MODELS = [
  'lyria_3_pro_preview',
  'mureka_song_generator',
] as const;

// ── lyria_3_pro_preview ───────────────────────────────────────────────────────

registerProvider({
  provider: 'audio',
  category: 'audio',
  models: ['lyria_3_pro_preview'] as const,
  buildBody(_model: string, prompt: string, _flags: GlobalFlags): Record<string, unknown> {
    return {
      model: 'lyria_3_pro_preview',
      dash_scope: true,
      moderation: true,
      input: [{ params: { input: prompt } }],
      metadata: {},
    };
  },
});

// ── mureka_song_generator ─────────────────────────────────────────────────────

registerProvider({
  provider: 'audio',
  category: 'audio',
  models: ['mureka_song_generator'] as const,
  buildBody(_model: string, prompt: string, flags: GlobalFlags): Record<string, unknown> {
    const lyrics = flags.lyrics as string | undefined;
    if (!lyrics) {
      throw new CLIError(
        'mureka_song_generator requires --lyrics.',
        ExitCode.USAGE,
      );
    }

    const params: Record<string, unknown> = { lyrics };
    if (prompt)               params['prompt']       = prompt;
    if (flags.murekaModel)    params['model']        = flags.murekaModel as string;
    if (flags.n)              params['n']            = flags.n as number;
    if (flags.referenceId)    params['reference_id'] = flags.referenceId as string;
    if (flags.vocalId)        params['vocal_id']     = flags.vocalId as string;
    if (flags.melodyId)       params['melody_id']    = flags.melodyId as string;

    return {
      model: 'mureka_song_generator',
      dash_scope: true,
      moderation: true,
      input: [{ params }],
      metadata: {},
    };
  },
});

// suppress unused
void (MUSIC_MODELS satisfies readonly string[]);
