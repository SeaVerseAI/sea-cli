import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import {
  parseConfigFile,
  type Config,
  type ConfigFile,
} from './schema';
import { ensureConfigDir, getConfigPath } from './paths';
import { detectOutputFormat, type OutputFormat } from '../output/formatter';
import type { GlobalFlags } from '../types/flags';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function normalizeBaseUrl(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);

  if (normalized.endsWith('/model')) {
    return normalized.slice(0, -'/model'.length);
  }

  if (normalized.endsWith('/llm')) {
    return normalized.slice(0, -'/llm'.length);
  }

  return normalized;
}

export function deriveBaseUrls(baseUrl: string): { multimodalBaseUrl: string; llmBaseUrl: string } {
  const normalized = normalizeBaseUrl(baseUrl);

  return {
    multimodalBaseUrl: `${normalized}/model`,
    llmBaseUrl: `${normalized}/llm`,
  };
}

export function readConfigFile(): ConfigFile {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    return parseConfigFile(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    const e = err as Error;
    if (e instanceof SyntaxError || e.message.includes('JSON')) {
      process.stderr.write(`Warning: config file is corrupted. Run 'sac config set' to reset.\n`);
    }
    return {};
  }
}

export async function writeConfigFile(data: Record<string, unknown>): Promise<void> {
  await ensureConfigDir();
  const path = getConfigPath();
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
}

export function loadConfig(flags: GlobalFlags): Config {
  const file = readConfigFile();

  const apiKey = flags.apiKey as string | undefined;
  const fileApiKey = file.api_key;

  const flagBaseUrl = flags.baseUrl as string | undefined;
  const envBaseUrl = process.env.SAC_BASE_URL;
  const rawBaseUrl = flagBaseUrl || envBaseUrl || file.base_url;
  const baseUrlSource = flagBaseUrl
    ? 'flag'
    : envBaseUrl
      ? 'env'
      : file.base_url
        ? 'config'
        : 'none';
  const baseUrl = rawBaseUrl ? normalizeBaseUrl(rawBaseUrl) : undefined;

  const { multimodalBaseUrl, llmBaseUrl } = baseUrl
    ? deriveBaseUrls(baseUrl)
    : { multimodalBaseUrl: '', llmBaseUrl: '' };

  const output: OutputFormat = detectOutputFormat(
    flags.output || process.env.SAC_OUTPUT || file.output,
  );

  const envTimeout = process.env.SAC_TIMEOUT ? Number(process.env.SAC_TIMEOUT) : undefined;
  const validEnvTimeout = envTimeout !== undefined && Number.isFinite(envTimeout) && envTimeout > 0
    ? envTimeout : undefined;
  const timeout = flags.timeout ?? validEnvTimeout ?? file.timeout ?? 300;

  return {
    apiKey,
    fileApiKey,
    configPath: getConfigPath(),
    baseUrl,
    baseUrlSource,
    multimodalBaseUrl,
    llmBaseUrl,
    output,
    timeout,
    defaultImageModel: file.default_image_model,
    defaultChatModel: file.default_chat_model,
    verbose: !!(flags.verbose || process.env.SAC_VERBOSE === '1'),
    quiet: flags.quiet || false,
    noColor: !!(flags.noColor || process.env.NO_COLOR !== undefined || !process.stdout.isTTY),
    yes: flags.yes || false,
    dryRun: flags.dryRun || false,
    nonInteractive: flags.nonInteractive || false,
    async: flags.async || false,
  };
}
