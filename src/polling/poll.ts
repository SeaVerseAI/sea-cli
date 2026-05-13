import type { Config } from '../config/schema';
import { requestJson } from '../client/http';
import { taskEndpoint } from '../client/endpoints';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';
import { createSpinner } from '../output/progress';

export interface TaskResponse {
  id: string;
  status: string;
  progress?: number;
  model?: string;
  output?: Array<{
    content?: Array<{ jobId?: string; type?: string; url?: string }>;
  }>;
  usage?: { cost?: number; discount?: number };
  metadata?: { completed_at?: number; in_queue_at?: number };
  error?: unknown;
}

export interface PollOptions {
  taskId: string;
  intervalSec?: number;
  timeoutSec?: number;
}

const NETWORK_RETRY_LIMIT = 3;

export async function pollTask(config: Config, opts: PollOptions): Promise<TaskResponse> {
  const intervalSec = opts.intervalSec ?? 3;
  const timeoutSec = opts.timeoutSec ?? config.timeout;
  const deadline = Date.now() + timeoutSec * 1000;
  const spinner = createSpinner('Waiting for task...');

  if (!config.quiet) spinner.start();

  let networkErrors = 0;

  try {
    while (Date.now() < deadline) {
      let data: TaskResponse;
      try {
        data = await requestJson<TaskResponse>(config, {
          url: taskEndpoint(config, opts.taskId),
          method: 'GET',
        });
        networkErrors = 0; // reset on success
      } catch (err) {
        const isNetwork = err instanceof CLIError && err.exitCode === ExitCode.NETWORK;
        if (isNetwork && networkErrors < NETWORK_RETRY_LIMIT) {
          networkErrors++;
          if (!config.quiet) spinner.update(`Network error, retrying (${networkErrors}/${NETWORK_RETRY_LIMIT})...`);
          await new Promise(r => setTimeout(r, intervalSec * 1000));
          continue;
        }
        // Network exhausted — attach task_id so the caller can surface it
        if (err instanceof CLIError) err.taskId = opts.taskId;
        throw err;
      }

      const status = data.status?.toLowerCase() ?? '';

      if (!config.quiet) {
        const pct = data.progress != null ? ` ${Math.round(data.progress * 100)}%` : '';
        spinner.update(`Status: ${status}${pct}`);
      }

      if (status === 'completed') {
        spinner.stop('Done.');
        return data;
      }

      if (status === 'failed') {
        spinner.stop('Failed.');
        const apiErr = data.error as { code?: number; error_message?: string } | null | undefined;
        const detail = apiErr?.error_message ?? (apiErr ? JSON.stringify(apiErr) : undefined);
        const msg = detail ? `Task failed: ${detail}` : 'Task failed.';
        throw new CLIError(msg, ExitCode.GENERAL);
      }

      await new Promise(r => setTimeout(r, intervalSec * 1000));
    }
  } finally {
    spinner.stop();
  }

  const timeoutErr = new CLIError(
    'Task timed out.',
    ExitCode.TIMEOUT,
    `Task is still running. Resume with: sac generate task ${opts.taskId} --wait --timeout 600`,
  );
  timeoutErr.taskId = opts.taskId;
  throw timeoutErr;
}
