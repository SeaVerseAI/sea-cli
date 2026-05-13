import { defineCommand } from '../../command';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { readConfigFile, writeConfigFile, deriveBaseUrls, normalizeBaseUrl } from '../../config/loader';
import { getConfigPath } from '../../config/paths';
import { isInteractive } from '../../utils/env';
import { promptText, promptConfirm } from '../../utils/prompt';
import { maskToken } from '../../utils/token';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import { probeApiKey } from '../../auth/probe';
import { formatOutput, detectOutputFormat } from '../../output/formatter';

export default defineCommand({
  name: 'auth login',
  description: 'Save your API key for authentication',
  usage: 'sac auth login --api-key <token> [--base-url <url>]',
  options: [
    { flag: '--api-key <key>', description: 'Bearer token to store' },
    { flag: '--base-url <url>', description: 'Model gateway base URL to store (e.g. https://gateway.example.com)' },
  ],
  examples: [
    'sac auth login --api-key sa-xxxxx',
    'sac auth login --api-key sa-xxxxx --base-url https://gateway.example.com',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const envKey = process.env.SAC_API_KEY;

    let key = flags.apiKey as string | undefined;
    const baseUrl = flags.baseUrl as string | undefined;

    if (!key && envKey) {
      if (isInteractive({ nonInteractive: config.nonInteractive })) {
        const proceed = await promptConfirm({
          message: `Detected SAC_API_KEY in environment (${maskToken(envKey)}).\nDo you want to save it to the config file?`,
        });
        if (proceed) key = envKey;
        else {
          console.log(formatOutput({
            skipped: true,
            message: 'Login skipped. Using environment variable.',
            source: 'SAC_API_KEY env var',
          }, format));
          return;
        }
      } else {
        key = envKey;
      }
    }

    if (!key) {
      if (!isInteractive({ nonInteractive: config.nonInteractive })) {
        throw new CLIError(
          '--api-key is required.',
          ExitCode.USAGE,
          'sac auth login --api-key sa-xxxxx',
        );
      }
      const input = await promptText({ message: 'Enter your SeaArt API key:' });
      if (!input) throw new CLIError('API key is required.', ExitCode.AUTH);
      key = input;
    }

    if (baseUrl && !baseUrl.startsWith('http')) {
      throw new CLIError(
        `Invalid --base-url "${baseUrl}". Must start with http or https.`,
        ExitCode.USAGE,
      );
    }
    const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;

    if (config.dryRun) {
      console.log(formatOutput({
        would_validate: true,
        would_save: true,
        key: maskToken(key),
        ...(normalizedBaseUrl ? { base_url: normalizedBaseUrl } : {}),
      }, format));
      return;
    }

    const probeConfig = normalizedBaseUrl
      ? { ...config, baseUrl: normalizedBaseUrl, baseUrlSource: 'flag' as const, ...deriveBaseUrls(normalizedBaseUrl) }
      : config;

    if (!probeConfig.multimodalBaseUrl) {
      throw new CLIError(
        'Gateway base URL is required to validate API key.',
        ExitCode.USAGE,
        'Pass it once: sac auth login --api-key <token> --base-url <url>\nOr set it first: sac config set --key base_url --value <url>',
      );
    }

    process.stderr.write('Validating API key... ');
    const probe = await probeApiKey({
      ...probeConfig,
      apiKey: key,
      fileApiKey: undefined,
    });

    if (probe.status === 'invalid') {
      process.stderr.write('Invalid\n');
      throw new CLIError(
        'API key validation failed.',
        ExitCode.AUTH,
        `${probe.message}\nRe-authenticate: sac auth login --api-key <token>`,
      );
    }

    if (probe.status === 'unknown') {
      process.stderr.write('Failed\n');
      throw new CLIError(
        'Could not validate API key.',
        ExitCode.NETWORK,
        `${probe.message}\nCheck your network and retry.`,
      );
    }

    process.stderr.write('Valid\n');

    const existing = readConfigFile() as Record<string, unknown>;
    existing.api_key = key;
    if (normalizedBaseUrl) {
      existing.base_url = normalizedBaseUrl;
    }
    await writeConfigFile(existing);

    const savedPath = getConfigPath();
    if (format === 'json') {
      console.log(formatOutput({
        authenticated: true,
        saved: true,
        key: maskToken(key),
        config: savedPath,
        ...(normalizedBaseUrl ? { base_url: normalizedBaseUrl } : {}),
        verification: {
          status: probe.status,
          message: probe.message,
          ...(probe.httpStatus !== undefined ? { http_status: probe.httpStatus } : {}),
        },
      }, format));
      return;
    }

    process.stderr.write(`API key saved to ${savedPath}\n`);
    if (normalizedBaseUrl) {
      process.stderr.write(`Gateway: ${normalizedBaseUrl}\n`);
    }
    process.stdout.write(`Logged in. Key: ${maskToken(key)}\n`);
  },
});
