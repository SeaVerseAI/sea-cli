export interface GlobalFlags {
  apiKey?: string;
  baseUrl?: string;
  output?: string;
  timeout?: number;
  quiet: boolean;
  verbose: boolean;
  noColor: boolean;
  yes: boolean;
  dryRun: boolean;
  help: boolean;
  nonInteractive: boolean;
  async: boolean;
  [key: string]: unknown;
}
