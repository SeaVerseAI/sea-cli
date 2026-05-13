import { scanCommandPath, parseFlags } from './args';
import { registry } from './registry';
import { GLOBAL_OPTIONS } from './command';
import { handleError } from './errors/handler';
import { loadConfig } from './config/loader';
import { checkForUpdate } from './updater';
import { resolveApiKey } from './auth/resolver';
import { setEffectiveOutputFormat } from './output/state';
import { CLI_VERSION } from './version';
import { CLIError } from './errors/base';
import { ExitCode } from './errors/codes';

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  process.stderr.write('\nInterrupted. Exiting.\n');
  process.exit(130);
});

// Handle stdout EPIPE gracefully
process.stdout.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EPIPE') process.exit(0);
  else throw e;
});

// Commands that don't require auth setup
const NO_AUTH_SETUP = [
  ['auth', 'login'],
  ['auth', 'logout'],
  ['auth', 'status'],
  ['config', 'show'],
  ['config', 'set'],
  ['update'],
  ['model', 'search'],
  ['model', 'get'],
];

// Commands that don't require a configured base URL
const NO_BASE_URL_REQUIRED = [
  ['auth', 'login'],
  ['auth', 'logout'],
  ['auth', 'status'],
  ['config', 'show'],
  ['config', 'set'],
  ['update'],
];

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`sac ${CLI_VERSION}`);
    await checkForUpdate(CLI_VERSION);
    process.exit(0);
  }

  const commandPath = scanCommandPath(argv, GLOBAL_OPTIONS, registry.topLevelCommands());

  if (argv.includes('--help') || argv.includes('-h')) {
    registry.printHelp(commandPath, process.stderr);
    process.exit(0);
  }

  // No command: show help
  if (commandPath.length === 0) {
    registry.printHelp([], process.stderr);
    process.exit(0);
  }

  const { command, extra } = registry.resolve(commandPath);
  const flags = parseFlags(argv, [...GLOBAL_OPTIONS, ...(command.options ?? [])]);

  if (extra.length > 0) (flags as Record<string, unknown>)._positional = extra;

  const config = loadConfig(flags);
  setEffectiveOutputFormat(config.output);

  // Check auth for commands that need it
  const needsAuthSetup = !NO_AUTH_SETUP.some(
    (cmd) => cmd.every((c, i) => commandPath[i] === c),
  );

  if (needsAuthSetup && !config.dryRun) {
    resolveApiKey(config);
  }

  // Check base URL for commands that need it
  const needsBaseUrl = !NO_BASE_URL_REQUIRED.some(
    (cmd) => cmd.every((c, i) => commandPath[i] === c),
  );

  if (needsBaseUrl && !config.multimodalBaseUrl && !config.dryRun) {
    throw new CLIError(
      'Gateway base URL is not configured.',
      ExitCode.USAGE,
      'Set it via: sac auth login --api-key <key> --base-url <url>\n' +
      'Or:         sac config set --key base_url --value <url>\n' +
      'Or:         export SAC_BASE_URL=<url>',
    );
  }

  await command.execute(config, flags);
}

main().catch(handleError);
