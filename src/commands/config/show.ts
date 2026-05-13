import { defineCommand } from '../../command';
import { readConfigFile } from '../../config/loader';
import { getConfigPath } from '../../config/paths';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { maskToken } from '../../utils/token';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

export default defineCommand({
  name: 'config show',
  description: 'Display current configuration',
  usage: 'sac config show',
  examples: [
    'sac config show',
    'sac config show --output json',
  ],
  async run(config: Config, _flags: GlobalFlags) {
    const file = readConfigFile();
    const format = detectOutputFormat(config.output);

    const result: Record<string, unknown> = {
      base_url: config.baseUrl ?? null,
      output: config.output,
      timeout: config.timeout,
      config_file: getConfigPath(),
    };

    if (file.api_key) result.api_key = maskToken(file.api_key);
    if (file.default_image_model) result.default_image_model = file.default_image_model;
    if (file.default_chat_model) result.default_chat_model = file.default_chat_model;

    console.log(formatOutput(result, format));
  },
});
