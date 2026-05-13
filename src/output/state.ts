import type { OutputFormat } from './formatter';

let effectiveOutputFormat: OutputFormat | null = null;

export function setEffectiveOutputFormat(format: OutputFormat): void {
  effectiveOutputFormat = format;
}

export function getEffectiveOutputFormat(): OutputFormat | null {
  return effectiveOutputFormat;
}
