import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Config } from '../../config/schema';
import { CLIError } from '../../errors/base';
import { ExitCode } from '../../errors/codes';
import { downloadFile } from '../../files/download';
import { formatOutput, type OutputFormat } from '../../output/formatter';
import type { TaskResponse } from '../../polling/poll';
import type { GlobalFlags } from '../../types/flags';
import { scanGeneratedUrls, type GeneratedContentSafetyResult } from '../content/safety';

export type ExtensionDetector = (url: string) => string;

export function rejectAsyncContentSafety(flags: GlobalFlags, config: Config): void {
  if (flags.contentSafety === true && (flags.async === true || config.async)) {
    throw new CLIError(
      '--content-safety cannot be combined with --async.',
      ExitCode.USAGE,
      'Omit --async so sac can poll the task and scan generated output URL(s), or scan later with `sac generate task <task-id> --wait --content-safety`.',
    );
  }
}

export function rejectUnsupportedContentSafety(flags: GlobalFlags, outputKind: string): void {
  if (flags.contentSafety !== true) return;
  throw new CLIError(
    `--content-safety is not supported for generate ${outputKind}.`,
    ExitCode.USAGE,
    'Use it with image/video generation, or scan a specific image/video URL with `sac content-safety --url <url>`.',
  );
}

export function extractUrls(data: TaskResponse): string[] {
  const urls: string[] = [];
  for (const out of data.output ?? []) {
    for (const c of out.content ?? []) {
      if (c.url) urls.push(c.url);
    }
  }
  return urls;
}

async function maybeScanSafety(
  config: Config,
  flags: GlobalFlags,
  urls: string[],
  opts: { forceVideo?: boolean; duration?: number },
): Promise<GeneratedContentSafetyResult[] | undefined> {
  if (flags.contentSafety !== true) return undefined;
  if (urls.length === 0) return [];

  return scanGeneratedUrls(config, urls, {
    isVideo: opts.forceVideo,
    duration: opts.duration,
  });
}

export async function printGenerationResult(
  config: Config,
  flags: GlobalFlags,
  format: OutputFormat,
  opts: {
    taskId: string;
    result: TaskResponse;
    defaultPrefix: string;
    detectExtension: ExtensionDetector;
    forceVideo?: boolean;
    duration?: number;
    rawUrlsInQuietText?: boolean;
  },
): Promise<void> {
  const urls = extractUrls(opts.result);
  const safety = await maybeScanSafety(config, flags, urls, {
    forceVideo: opts.forceVideo,
    duration: opts.duration,
  });

  if (urls.length === 0) {
    console.log(formatOutput(safety ? { ...opts.result, safety } : opts.result, format));
    return;
  }

  if (flags.outDir) {
    const outDir = flags.outDir as string;
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const prefix = (flags.outPrefix as string) || opts.defaultPrefix;
    const saved: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      const ext = opts.detectExtension(urls[i]!);
      const filename = `${prefix}_${String(i + 1).padStart(3, '0')}.${ext}`;
      const destPath = join(outDir, filename);
      await downloadFile(urls[i]!, destPath, { quiet: config.quiet });
      saved.push(destPath);
    }

    console.log(formatOutput({
      task_id: opts.taskId,
      saved,
      ...(safety ? { safety } : {}),
    }, format));
  } else if ((opts.rawUrlsInQuietText ?? true) && config.quiet && format === 'text' && !safety) {
    console.log(urls.join('\n'));
  } else {
    console.log(formatOutput({
      task_id: opts.taskId,
      urls,
      ...(safety ? { safety } : {}),
    }, format));
  }
}
