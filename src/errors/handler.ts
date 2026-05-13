import { CLIError } from './base';
import { ExitCode } from './codes';
import { detectOutputFormat } from '../output/formatter';
import { getEffectiveOutputFormat } from '../output/state';

export function handleError(err: unknown): never {
  if (err instanceof CLIError) {
    const format = getEffectiveOutputFormat() ?? detectOutputFormat(process.env.SAC_OUTPUT);

    if (format === 'json') {
      process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + '\n');
    } else {
      process.stderr.write(`\nError: ${err.message}\n`);
      if (err.taskId) {
        process.stderr.write(`\n  Task ID: ${err.taskId}\n`);
      }
      if (err.hint) {
        process.stderr.write(`\n  ${err.hint.split('\n').join('\n  ')}\n`);
      }
      process.stderr.write(`  (exit code ${err.exitCode})\n`);
    }
    process.exit(err.exitCode);
  }

  if (err instanceof Error) {
    if (
      err.name === 'AbortError' ||
      err.name === 'TimeoutError' ||
      err.message.includes('timed out')
    ) {
      return handleError(new CLIError(
        'Request timed out.',
        ExitCode.TIMEOUT,
        'Try increasing --timeout (e.g. --timeout 60).',
      ));
    }

    if (err instanceof TypeError && err.message === 'fetch failed') {
      return handleError(new CLIError(
        'Network request failed.',
        ExitCode.NETWORK,
        'Check your network connection.',
      ));
    }

    const msg = err.message.toLowerCase();
    const isNetworkError =
      msg.includes('failed to fetch') ||
      msg.includes('connection refused') ||
      msg.includes('econnrefused') ||
      msg.includes('connection reset') ||
      msg.includes('econnreset') ||
      msg.includes('enotfound') ||
      msg.includes('getaddrinfo') ||
      msg.includes('etimedout') ||
      msg.includes('timeout');

    if (isNetworkError) {
      return handleError(new CLIError(
        'Network request failed.',
        ExitCode.NETWORK,
        'Check your network connection and proxy settings.',
      ));
    }

    const ecode = (err as NodeJS.ErrnoException).code;
    if (ecode === 'ENOENT') {
      return handleError(new CLIError(`File or directory not found: ${err.message}`, ExitCode.GENERAL, 'Check the file path.'));
    }
    if (ecode === 'EACCES' || ecode === 'EPERM') {
      return handleError(new CLIError(`Permission denied: ${err.message}`, ExitCode.GENERAL, 'Check file permissions.'));
    }

    process.stderr.write(`\nError: ${err.message}\n`);
    if (process.env.SAC_VERBOSE === '1') {
      process.stderr.write(`${err.stack}\n`);
    }
  } else {
    process.stderr.write(`\nError: ${String(err)}\n`);
  }

  process.exit(ExitCode.GENERAL);
}
