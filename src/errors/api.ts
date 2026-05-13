import { CLIError } from './base';
import { ExitCode } from './codes';

export interface ApiErrorBody {
  error?: {
    message?: string;
    code?: string | number;
  };
  message?: string;
  code?: string | number;
}

export function mapApiError(status: number, body: ApiErrorBody, url?: string): CLIError {
  const apiMsg =
    body.error?.message ||
    body.message ||
    `HTTP ${status}`;

  const urlHint = url ? `\nURL: ${url}` : '';

  if (status === 401 || status === 403) {
    return new CLIError(
      `Authentication failed (HTTP ${status}).${urlHint}`,
      ExitCode.AUTH,
      'Check status: sac auth status\nRe-authenticate: sac auth login --api-key <key>',
    );
  }

  if (status === 429) {
    return new CLIError(
      `Rate limit exceeded. ${apiMsg}`,
      ExitCode.QUOTA,
      'Please wait and retry.',
    );
  }

  if (status === 408 || status === 504) {
    return new CLIError(
      `Request timed out (HTTP ${status}).`,
      ExitCode.TIMEOUT,
      'Try increasing --timeout or retry later.',
    );
  }

  return new CLIError(
    `API error: ${apiMsg} (HTTP ${status})${urlHint}`,
    ExitCode.GENERAL,
  );
}
