import type { Config } from '../config/schema';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';

export interface ResolvedApiKey {
  token: string;
  source: 'flag' | 'env' | 'config';
}

export function maybeResolveApiKey(config: Config): ResolvedApiKey | null {
  if (config.apiKey) {
    return { token: config.apiKey, source: 'flag' };
  }

  const envKey = process.env.SAC_API_KEY;
  if (envKey) {
    return { token: envKey, source: 'env' };
  }

  if (config.fileApiKey) {
    return { token: config.fileApiKey, source: 'config' };
  }

  return null;
}

export function resolveApiKey(config: Config): ResolvedApiKey {
  const resolved = maybeResolveApiKey(config);
  if (resolved) return resolved;

  throw new CLIError(
    'No API key found.',
    ExitCode.AUTH,
    'Set env var:    export SAC_API_KEY=<token>\nPass directly:  --api-key <token>\nOr login:       sac auth login --api-key <token>',
  );
}
