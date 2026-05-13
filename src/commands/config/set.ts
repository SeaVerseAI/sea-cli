import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { normalizeBaseUrl, readConfigFile, writeConfigFile } from '../../config/loader';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';

const VALID_KEYS = [
  'api_key',
  'output',
  'timeout',
  'default_image_model',
  'default_chat_model',
  'base_url',
];

export default defineCommand({
  name: 'config set',
  description: 'Set a configuration value',
  usage: 'sac config set --key <key> --value <value>',
  options: [
    { flag: '--key <key>',     description: `Config key: ${VALID_KEYS.join(', ')}` },
    { flag: '--value <value>', description: 'Value to set' },
  ],
  examples: [
    'sac config set --key output --value json',
    'sac config set --key timeout --value 600',
    'sac config set --key default_image_model --value sdxl',
    'sac config set --key default_chat_model --value deepseek-v3-0324',
    'sac config set --key base_url --value https://gateway.example.com',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const key = flags.key as string | undefined;
    const value = flags.value as string | undefined;

    if (!key || value === undefined) {
      throw new CLIError('--key and --value are required.', ExitCode.USAGE, 'sac config set --key <key> --value <value>');
    }

    if (!VALID_KEYS.includes(key)) {
      throw new CLIError(
        `Invalid config key "${key}". Valid keys: ${VALID_KEYS.join(', ')}`,
        ExitCode.USAGE,
      );
    }

    if (key === 'output' && !['text', 'json'].includes(value)) {
      throw new CLIError(`Invalid output "${value}". Valid values: text, json`, ExitCode.USAGE);
    }

    if (key === 'timeout') {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        throw new CLIError(`Invalid timeout "${value}". Must be a positive number.`, ExitCode.USAGE);
      }
    }

    if (key === 'base_url' && !value.startsWith('http')) {
      throw new CLIError(`Invalid URL "${value}". Must start with http or https.`, ExitCode.USAGE);
    }

    const format = detectOutputFormat(config.output);

    const savedValue = key === 'timeout'
      ? Number(value)
      : key === 'base_url'
        ? normalizeBaseUrl(value)
        : value;

    if (config.dryRun) {
      console.log(formatOutput({ would_set: { [key]: savedValue } }, format));
      return;
    }

    const existing = readConfigFile() as Record<string, unknown>;
    existing[key] = savedValue;
    await writeConfigFile(existing);

    if (format === 'json') {
      console.log(formatOutput({ [key]: existing[key] }, format));
      return;
    }

    if (!config.quiet) {
      console.log(formatOutput({ [key]: existing[key] }, format));
    }
  },
});
