export interface ConfigFile {
  api_key?: string;
  output?: 'text' | 'json';
  timeout?: number;
  default_image_model?: string;
  default_chat_model?: string;
  base_url?: string;
}

const VALID_OUTPUTS = new Set<string>(['text', 'json']);

function normalizeConfigBaseUrl(url: string): string {
  const normalized = url.replace(/\/+$/, '');
  if (normalized.endsWith('/model')) return normalized.slice(0, -'/model'.length);
  if (normalized.endsWith('/llm')) return normalized.slice(0, -'/llm'.length);
  return normalized;
}

export function parseConfigFile(raw: unknown): ConfigFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: ConfigFile = {};

  if (typeof obj.api_key === 'string') out.api_key = obj.api_key;
  if (typeof obj.output === 'string' && VALID_OUTPUTS.has(obj.output)) out.output = obj.output as ConfigFile['output'];
  if (typeof obj.timeout === 'number' && obj.timeout > 0) out.timeout = obj.timeout;
  if (typeof obj.default_image_model === 'string' && obj.default_image_model.length > 0) out.default_image_model = obj.default_image_model;
  if (typeof obj.default_chat_model === 'string' && obj.default_chat_model.length > 0) out.default_chat_model = obj.default_chat_model;
  if (typeof obj.base_url === 'string' && obj.base_url.startsWith('http')) {
    out.base_url = normalizeConfigBaseUrl(obj.base_url);
  } else if (typeof obj.multimodal_base_url === 'string' && obj.multimodal_base_url.startsWith('http')) {
    out.base_url = normalizeConfigBaseUrl(obj.multimodal_base_url);
  } else if (typeof obj.llm_base_url === 'string' && obj.llm_base_url.startsWith('http')) {
    out.base_url = normalizeConfigBaseUrl(obj.llm_base_url);
  }

  return out;
}

export interface Config {
  apiKey?: string;
  fileApiKey?: string;
  configPath?: string;
  baseUrl?: string;
  baseUrlSource?: 'flag' | 'env' | 'config' | 'none';
  multimodalBaseUrl: string;
  llmBaseUrl: string;
  output: 'text' | 'json';
  timeout: number;
  defaultImageModel?: string;
  defaultChatModel?: string;
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  yes: boolean;
  dryRun: boolean;
  nonInteractive: boolean;
  async: boolean;
}
