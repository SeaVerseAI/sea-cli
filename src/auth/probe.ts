import { randomUUID } from 'crypto';
import { taskEndpoint } from '../client/endpoints';
import type { Config } from '../config/schema';
import { resolveApiKey, type ResolvedApiKey } from './resolver';
import { CLI_VERSION } from '../version';

export interface ApiKeyProbeResult {
  status: 'valid' | 'invalid' | 'unknown';
  message: string;
  httpStatus?: number;
  taskId: string;
}

interface ErrorBody {
  error?: { message?: string };
  message?: string;
}

function isTaskNotFoundMessage(message?: string): boolean {
  if (!message) return false;
  return /task not found/i.test(message.trim());
}

async function readErrorBody(res: Response): Promise<ErrorBody> {
  try {
    return (await res.json()) as ErrorBody;
  } catch {
    return {};
  }
}

export async function probeApiKey(
  config: Config,
  resolved: ResolvedApiKey = resolveApiKey(config),
): Promise<ApiKeyProbeResult> {
  const taskId = `probe-${randomUUID()}`;
  const res = await fetch(taskEndpoint(config, taskId), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${resolved.token}`,
      'User-Agent': `sac-cli/${CLI_VERSION}`,
    },
    signal: AbortSignal.timeout(config.timeout * 1000),
  }).catch((err: unknown) => {
    const e = err as Error & { name?: string };
    const message = e.name === 'TimeoutError'
      ? 'Probe request timed out.'
      : `Probe request failed: ${e.message}`;
    return { error: err, message };
  });

  if (!(res instanceof Response)) {
    return {
      status: 'unknown',
      message: res.message,
      taskId,
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      status: 'invalid',
      message: `API key was rejected (HTTP ${res.status}).`,
      httpStatus: res.status,
      taskId,
    };
  }

  if (res.status === 404 || res.ok) {
    return {
      status: 'valid',
      message: res.status === 404
        ? 'API key accepted; probe task was not found, as expected.'
        : 'API key accepted.',
      httpStatus: res.status,
      taskId,
    };
  }

  const body = await readErrorBody(res);
  const detail = body.error?.message || body.message || `HTTP ${res.status}`;

  if (isTaskNotFoundMessage(detail)) {
    return {
      status: 'valid',
      message: 'API key accepted; probe task was not found, as expected.',
      httpStatus: res.status,
      taskId,
    };
  }

  return {
    status: 'unknown',
    message: `Probe returned ${detail}.`,
    httpStatus: res.status,
    taskId,
  };
}
