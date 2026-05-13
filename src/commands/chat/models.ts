import { defineCommand } from '../../command';
import { requestJson } from '../../client/http';
import { modelsEndpoint } from '../../client/endpoints';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

interface ModelsResponse {
  object: string;
  data: Array<{ id: string; object: string; created: number; owned_by: string }>;
}

export default defineCommand({
  name: 'chat models',
  description: 'List available LLM models',
  usage: 'sac chat models',
  options: [
    { flag: '--filter <text>', description: 'Filter model IDs by substring' },
  ],
  examples: [
    'sac chat models',
    'sac chat models --filter claude',
    'sac chat models --output json',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      console.log(formatOutput({ url: modelsEndpoint(config) }, format));
      return;
    }

    const resp = await requestJson<ModelsResponse>(config, {
      url: modelsEndpoint(config),
      method: 'GET',
    });

    let models = (resp.data ?? []).map(m => m.id);

    const filter = flags.filter as string | undefined;
    if (filter) {
      models = models.filter(id => id.includes(filter));
    }

    if (format === 'json') {
      console.log(formatOutput({ models }, format));
    } else {
      if (config.quiet) {
        console.log(models.join('\n'));
      } else {
        process.stderr.write(`${models.length} model(s)${filter ? ` matching "${filter}"` : ''}:\n`);
        console.log(models.join('\n'));
      }
    }
  },
});
