import type { Config } from '../config/schema';
import type { ApiErrorBody } from '../errors/api';
import { CLIError } from '../errors/base';
import { ExitCode } from '../errors/codes';
import { mapApiError } from '../errors/api';
import { resolveApiKey } from '../auth/resolver';
import { CLI_VERSION } from '../version';
import { maskToken } from '../utils/token';

export interface RequestOpts {
  url: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  noAuth?: boolean;
  /** Max retry attempts on network errors or 5xx. Default: 3. Set to 0 to disable. */
  retry?: number;
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];
let activeProxyUrl: string | null = null;
let undiciPromise: Promise<typeof import('undici')> | undefined;

function loadUndici(): Promise<typeof import('undici')> {
  undiciPromise ??= import('undici');
  return undiciPromise;
}

function envValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function noProxyMatches(hostname: string, noProxy: string): boolean {
  const normalized = hostname.toLowerCase();
  return noProxy.split(',').some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern === '*') return true;
    if (pattern.startsWith('.')) return normalized.endsWith(pattern);
    return normalized === pattern || normalized.endsWith(`.${pattern}`);
  });
}

function proxyForUrl(rawUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (isLocalHostname(url.hostname)) return undefined;

  const noProxy = envValue('NO_PROXY', 'no_proxy');
  if (noProxy && noProxyMatches(url.hostname, noProxy)) return undefined;

  if (url.protocol === 'https:') {
    return envValue('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy');
  }

  if (url.protocol === 'http:') {
    return envValue('HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy');
  }

  return undefined;
}

async function configureProxy(rawUrl: string): Promise<void> {
  const proxyUrl = proxyForUrl(rawUrl) ?? null;
  if (activeProxyUrl === proxyUrl) return;
  const { Agent, ProxyAgent, setGlobalDispatcher } = await loadUndici();
  setGlobalDispatcher(proxyUrl ? new ProxyAgent(proxyUrl) : new Agent());
  activeProxyUrl = proxyUrl;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof CLIError) return err.exitCode === ExitCode.NETWORK;
  return true; // raw fetch errors (TypeError etc.)
}

async function doFetch(config: Config, opts: RequestOpts): Promise<Response> {
  await configureProxy(opts.url);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': `sac-cli/${CLI_VERSION}`,
    ...opts.headers,
  };

  if (!opts.noAuth) {
    const resolved = resolveApiKey(config);
    headers['Authorization'] = `Bearer ${resolved.token}`;

    if (config.verbose) {
      process.stderr.write(`> ${opts.method ?? 'GET'} ${opts.url}\n`);
      process.stderr.write(`> Auth: ${maskToken(resolved.token)}\n`);
    }
  }

  const timeoutMs = (opts.timeout ?? config.timeout) * 1000;

  const res = await fetch(opts.url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (config.verbose) {
    process.stderr.write(`< ${res.status} ${res.statusText}\n`);
  }

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try { body = (await res.json()) as ApiErrorBody; } catch { /* non-JSON */ }
    const err = mapApiError(res.status, body, opts.url);
    // 5xx is retryable; 4xx is not
    if (res.status >= 500) throw new CLIError(err.message, ExitCode.NETWORK, err.hint);
    throw err;
  }

  return res;
}

export async function request(config: Config, opts: RequestOpts): Promise<Response> {
  const isGet = (opts.method ?? 'GET').toUpperCase() === 'GET';
  const maxRetries = opts.retry ?? (isGet ? 3 : 0);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await doFetch(config, opts);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isRetryable(err)) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 4000));
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

export async function requestJson<T>(config: Config, opts: RequestOpts): Promise<T> {
  const res = await request(config, opts);
  try {
    return (await res.json()) as T;
  } catch {
    const contentType = res.headers.get('content-type') || '';
    throw new CLIError(
      `API returned non-JSON response (${contentType || 'unknown type'}). Server may be experiencing issues.`,
      ExitCode.GENERAL,
    );
  }
}
