import { defineCommand } from '../../command';
import { readConfigFile } from '../../config/loader';
import { formatOutput, detectOutputFormat } from '../../output/formatter';
import { maskToken } from '../../utils/token';
import type { Config } from '../../config/schema';
import type { GlobalFlags } from '../../types/flags';
import { maybeResolveApiKey } from '../../auth/resolver';
import { probeApiKey } from '../../auth/probe';
import { ExitCode } from '../../errors/codes';

export default defineCommand({
  name: 'auth status',
  description: 'Show current authentication state',
  usage: 'sac auth status',
  options: [
    { flag: '--check', description: 'Verify the current API key against the API', type: 'boolean' },
  ],
  examples: [
    'sac auth status',
    'sac auth status --check',
    'sac auth status --output json',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const file = readConfigFile();
    const format = detectOutputFormat(config.output);
    const resolved = maybeResolveApiKey(config);

    if (!resolved) {
      const result = {
        authenticated: false,
        message: 'Not authenticated.',
        hint: 'Run: sac auth login --api-key <token>\nOr set: export SAC_API_KEY=<token>',
      };
      console.log(formatOutput(result, format));
      return;
    }

    let verification: Record<string, unknown> | undefined;
    if (flags.check) {
      if (config.dryRun) {
        verification = {
          status: 'skipped',
          message: 'Dry-run mode skips remote verification.',
        };
      } else if (!config.multimodalBaseUrl) {
        verification = {
          status: 'skipped',
          message: 'Gateway base URL not configured. Set it with: sac config set --key base_url --value <url>',
        };
      } else {
        const probe = await probeApiKey(config, resolved);
        verification = {
          status: probe.status,
          message: probe.message,
          ...(probe.httpStatus !== undefined ? { http_status: probe.httpStatus } : {}),
        };

        if (probe.status === 'invalid') process.exitCode = ExitCode.AUTH;
        if (probe.status === 'unknown') process.exitCode = ExitCode.NETWORK;
      }
    }

    const source = resolved.source === 'flag'
      ? '--api-key flag'
      : resolved.source === 'env'
        ? 'SAC_API_KEY env var'
        : 'config file';

    const urlSource = config.baseUrlSource === 'flag'
      ? '--base-url flag'
      : config.baseUrlSource === 'env'
        ? 'SAC_BASE_URL env var'
        : config.baseUrlSource === 'config'
          ? 'config file'
          : 'not configured';

    const gatewayDisplay = config.baseUrl || '(not configured)';

    const result: Record<string, unknown> = {
      authenticated: true,
      key: maskToken(resolved.token),
      source,
      gateway: {
        base_url: config.baseUrl ?? null,
        source: urlSource,
      },
    };
    if (file.api_key) {
      result.config = config.configPath;
    }
    if (verification) {
      result.verification = verification;
    }

    if (format === 'json') {
      console.log(formatOutput(result, format));
      return;
    }

    process.stdout.write('Authenticated\n');
    process.stdout.write(`  Key:     ${result.key}\n`);
    process.stdout.write(`  Source:  ${source}\n`);
    process.stdout.write(`  Gateway: ${gatewayDisplay} (${urlSource})\n`);
    if (result.config) {
      process.stdout.write(`  Config:  ${result.config}\n`);
    }
    if (verification) {
      process.stdout.write(`  Check:   ${verification.status}\n`);
      process.stdout.write(`  Detail:  ${verification.message}\n`);
    }
  },
});
