import { defineCommand } from '../../command';
import { contentSafetyEndpoint } from '../../client/endpoints';
import { requestJson } from '../../client/http';
import type { Config } from '../../config/schema';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { detectOutputFormat, formatOutput } from '../../output/formatter';
import type { GlobalFlags } from '../../types/flags';

export interface ContentSafetyScanRequest {
  uri: string;
  risk_types?: string[];
  detected_age?: number;
  is_video?: number;
  duration?: number;
}

export interface ContentSafetyScanResult {
  url: string;
  status: 'completed';
  is_video: boolean;
  result: unknown;
}

export interface ContentSafetyScanFailure {
  url: string;
  status: 'failed';
  is_video: boolean;
  error: string;
}

export type GeneratedContentSafetyResult = ContentSafetyScanResult | ContentSafetyScanFailure;

const GENERATED_SCAN_TIMEOUT_SEC = 15;

export function inferIsVideo(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  return /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(path);
}

function hasKnownUnsupportedSafetyExtension(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  return /\.(mp3|wav|m4a|aac|ogg|flac|glb|gltf|obj|fbx|stl|zip|rar|7z)$/.test(path);
}

function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === 'string' && value.length > 0) return [value];
  return undefined;
}

function parseVideoFlag(flags: GlobalFlags, url: string): boolean {
  if (flags.video === true) return true;
  if (flags.image === true) return false;
  return inferIsVideo(url);
}

interface ScanContentSafetyOptions {
  url: string;
  isVideo?: boolean;
  riskTypes?: string[];
  detectedAge?: number;
  duration?: number;
  timeoutSec?: number;
}

export function buildContentSafetyRequest(opts: ScanContentSafetyOptions): {
  body: ContentSafetyScanRequest;
  isVideo: boolean;
} {
  const isVideo = opts.isVideo ?? inferIsVideo(opts.url);
  const body: ContentSafetyScanRequest = {
    uri: opts.url,
    is_video: isVideo ? 1 : 0,
  };

  if (opts.riskTypes && opts.riskTypes.length > 0) body.risk_types = opts.riskTypes;
  if (opts.detectedAge !== undefined) body.detected_age = opts.detectedAge;
  if (opts.duration !== undefined) body.duration = opts.duration;

  return { body, isVideo };
}

export async function scanContentSafety(
  config: Config,
  opts: ScanContentSafetyOptions,
): Promise<ContentSafetyScanResult> {
  const { body, isVideo } = buildContentSafetyRequest(opts);

  const result = await requestJson<unknown>(config, {
    url: contentSafetyEndpoint(config),
    method: 'POST',
    body,
    timeout: opts.timeoutSec,
  });

  return {
    url: opts.url,
    status: 'completed',
    is_video: isVideo,
    result,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof CLIError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function scanGeneratedUrls(
  config: Config,
  urls: string[],
  opts: { isVideo?: boolean; duration?: number } = {},
): Promise<GeneratedContentSafetyResult[]> {
  return Promise.all(urls.map(async (url) => {
    const isVideo = opts.isVideo ?? inferIsVideo(url);
    if (!isVideo && hasKnownUnsupportedSafetyExtension(url)) {
      return {
        url,
        status: 'failed' as const,
        is_video: false,
        error: 'Unsupported content safety media type for generated URL.',
      };
    }

    try {
      return await scanContentSafety(config, {
        url,
        isVideo,
        duration: opts.duration,
        timeoutSec: GENERATED_SCAN_TIMEOUT_SEC,
      });
    } catch (err) {
      return {
        url,
        status: 'failed' as const,
        is_video: isVideo,
        error: errorMessage(err),
      };
    }
  }));
}

export default defineCommand({
  name: 'content-safety',
  description: 'Scan an image or video URL with the gateway content safety service',
  usage: 'sac content-safety --url <url> [flags]',
  options: [
    { flag: '--url <url>',          description: 'Image or video URL to scan', required: true },
    { flag: '--risk-type <type>',   description: 'Risk type to scan for (repeatable)', type: 'array' },
    { flag: '--detected-age <age>', description: 'Detected age hint for the scanner', type: 'number' },
    { flag: '--duration <s>',       description: 'Video duration in seconds for pricing', type: 'number' },
    { flag: '--video',              description: 'Force video scan mode', type: 'boolean' },
    { flag: '--image',              description: 'Force image scan mode', type: 'boolean' },
  ],
  examples: [
    'sac content-safety --url https://example.com/image.jpg',
    'sac content-safety --url https://example.com/video.mp4 --video --duration 8',
    'sac content-safety --url https://example.com/image.jpg --risk-type porn',
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const url = flags.url as string | undefined;

    if (!url) {
      throw new CLIError('--url is required.', ExitCode.USAGE, 'sac content-safety --url <url>');
    }

    if (flags.video === true && flags.image === true) {
      throw new CLIError('--video cannot be combined with --image.', ExitCode.USAGE);
    }

    const scanOpts = {
      url,
      isVideo: parseVideoFlag(flags, url),
      riskTypes: stringArray(flags.riskType),
      detectedAge: flags.detectedAge as number | undefined,
      duration: flags.duration as number | undefined,
    };

    if (config.dryRun) {
      console.log(formatOutput({ request: buildContentSafetyRequest(scanOpts).body }, format));
      return;
    }

    const result = await scanContentSafety(config, {
      ...scanOpts,
    });

    console.log(formatOutput(result, format));
  },
});
