import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { selfUpdate } from '../../updater';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import { CLI_VERSION } from '../../version';

export default defineCommand({
  name: 'update',
  description: 'Show how to update sac',
  usage: 'sac update',
  options: [
    { flag: '--force', description: 'Accepted for compatibility; no binary reinstall is performed', type: 'boolean' },
  ],
  examples: [
    'sac update',
  ],
  async run(config: Config, flags: GlobalFlags) {
    if (flags.output === 'json' || process.env.SAC_OUTPUT === 'json') {
      throw new CLIError(
        'The update command does not support --output json.',
        ExitCode.USAGE,
        'Use --output text for update progress and results.',
      );
    }

    await selfUpdate(CLI_VERSION, {
      quiet: config.quiet,
      force: flags.force as boolean || false,
    });
  },
});
