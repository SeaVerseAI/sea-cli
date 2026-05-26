import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { requestJson } from '../../client/http';
import { generationEndpoint } from '../../client/endpoints';
import { pollTask } from '../../polling/poll';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import { printGenerationResult, rejectAsyncContentSafety } from './results';

interface GenerationCreateResponse {
  id: string;
  status: string;
  error?: unknown;
}

export default defineCommand({
  name: 'generate submit',
  description: 'Submit a raw generation request body and poll for results',
  usage: 'sac generate submit --body-json <json> [flags]',
  options: [
    { flag: '--body-json <json>', description: 'Complete request body as a JSON string', required: true },
    { flag: '--out-dir <dir>',    description: 'Download output files to this directory' },
    { flag: '--out-prefix <pfx>', description: 'Filename prefix for downloads (default: output)' },
    { flag: '--content-safety',   description: 'Scan generated output URL(s) after polling completes', type: 'boolean' },
    { flag: '--async',            description: 'Return task ID immediately without polling', type: 'boolean' },
  ],
  examples: [
    `sac generate submit --body-json '{"model":"comfyuifast","input":[{"params":{"prompt":"1 girl"}}]}'`,
    `sac generate submit --body-json '{"id":"ext-001","model":"comfyuifast","input":[{"params":{"prompt":"1 girl"}}]}' --async`,
    `sac generate submit --body-json '{"model":"comfyuifast","input":[{"params":{"prompt":"1 girl"}}]}' --out-dir ./output`,
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    const rawBody = flags.bodyJson as string | undefined;
    if (!rawBody) {
      throw new CLIError('--body-json is required.', ExitCode.USAGE, 'sac generate submit --body-json <json>');
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody!);
    } catch {
      throw new CLIError('--body-json is not valid JSON.', ExitCode.USAGE);
    }

    rejectAsyncContentSafety(flags, config);

    if (config.dryRun) {
      console.log(formatOutput({ request: body }, format));
      return;
    }

    const url = generationEndpoint(config);

    const createResp = await requestJson<GenerationCreateResponse>(config, {
      url,
      method: 'POST',
      body,
    });

    const taskId = createResp.id;
    if (!taskId) {
      throw new CLIError('No task ID in API response.', ExitCode.GENERAL);
    }

    if (flags.async || config.async) {
      console.log(formatOutput({ task_id: taskId, status: createResp.status }, format));
      return;
    }

    const result = await pollTask(config, { taskId });
    await printGenerationResult(config, flags, format, {
      taskId,
      result,
      defaultPrefix: 'output',
      rawUrlsInQuietText: false,
      detectExtension: (url) => {
        const match = url.match(/\.([a-z0-9]+)(?:[?#].*)?$/i);
        return match?.[1]?.toLowerCase() ?? 'webp';
      },
    });
  },
});
