import { defineCommand } from '../../command';
import { readConfigFile, writeConfigFile } from '../../config/loader';
import { detectOutputFormat, formatOutput } from '../../output/formatter';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

export default defineCommand({
  name: 'auth logout',
  description: 'Remove stored API key',
  usage: 'sac auth logout',
  examples: ['sac auth logout'],
  async run(config: Config, _flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);

    if (config.dryRun) {
      console.log(formatOutput({
        would_remove: true,
        removed: false,
      }, format));
      return;
    }

    const existing = readConfigFile() as Record<string, unknown>;
    if (!existing.api_key) {
      console.log(formatOutput({
        removed: false,
        message: 'No API key stored in config.',
      }, format));
      return;
    }

    delete existing.api_key;
    await writeConfigFile(existing);
    console.log(formatOutput({
      removed: true,
      message: 'API key removed from config.',
    }, format));
  },
});
