import { defineCommand } from '../../command';
import { requestJson } from '../../client/http';
import { taskEndpoint } from '../../client/endpoints';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { pollTask } from '../../polling/poll';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import type { TaskResponse } from '../../polling/poll';

export default defineCommand({
  name: 'generate task',
  description: 'Query or wait for a generation task',
  usage: 'sac generate task <task-id> [flags]',
  options: [
    { flag: '--wait',             description: 'Poll until task completes (or fails/times out)', type: 'boolean' },
    { flag: '--interval <s>',     description: 'Poll interval in seconds (default: 3, requires --wait)', type: 'number' },
    { flag: '--timeout <s>',      description: 'Max wait time in seconds (default: global --timeout, requires --wait)', type: 'number' },
    { flag: '--output-only-url',  description: 'Print only image URL(s), one per line (suppresses JSON envelope)', type: 'boolean' },
  ],
  examples: [
    'sac generate task abc123',
    'sac generate task abc123 --output json',
    'sac generate task abc123 --wait',
    'sac generate task abc123 --wait --interval 5 --timeout 120',
    'sac generate task abc123 --wait --output-only-url',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const taskId = (flags._positional as string[] | undefined)?.[0] ?? (flags.taskId as string | undefined);

    if (!taskId) {
      throw new CLIError('Task ID is required.', ExitCode.USAGE, 'sac generate task <task-id>');
    }

    const format = detectOutputFormat(config.output);
    const outputOnlyUrl = flags.outputOnlyUrl === true;

    if (outputOnlyUrl && format === 'json') {
      throw new CLIError(
        '--output-only-url cannot be combined with --output json.',
        ExitCode.USAGE,
        'Use --output text for raw URLs, or omit --output-only-url for structured JSON.',
      );
    }

    if (flags.wait) {
      // Poll until completed / failed / timeout
      const intervalSec = flags.interval as number | undefined;
      const timeoutSec  = (flags.timeout as number | undefined) ?? config.timeout;

      const result = await pollTask(config, { taskId, intervalSec, timeoutSec });

      if (outputOnlyUrl) {
        const urls = extractUrls(result);
        if (urls.length > 0) {
          console.log(urls.join('\n'));
        } else {
          console.log(formatOutput(result, format));
        }
      } else {
        console.log(formatOutput(result, format));
      }
      return;
    }

    // Single-shot query
    const data = await requestJson<TaskResponse>(config, {
      url: taskEndpoint(config, taskId),
      method: 'GET',
    });

    if (outputOnlyUrl) {
      const urls = extractUrls(data);
      if (urls.length > 0) {
        console.log(urls.join('\n'));
        return;
      }
    }

    console.log(formatOutput(data, format));
  },
});

function extractUrls(data: TaskResponse): string[] {
  const urls: string[] = [];
  for (const out of data.output ?? []) {
    for (const c of out.content ?? []) {
      if (c.url) urls.push(c.url);
    }
  }
  return urls;
}
