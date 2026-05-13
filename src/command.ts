import type { Config } from './config/schema';
import type { GlobalFlags } from './types/flags';

export interface OptionDef {
  flag: string;
  description: string;
  type?: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
}

export interface Command {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  execute(config: Config, flags: GlobalFlags): Promise<void>;
}

export interface CommandSpec {
  name: string;
  description: string;
  usage?: string;
  options?: OptionDef[];
  examples?: string[];
  run(config: Config, flags: GlobalFlags): Promise<void>;
}

export function defineCommand(spec: CommandSpec): Command {
  return {
    name: spec.name,
    description: spec.description,
    usage: spec.usage,
    options: spec.options,
    examples: spec.examples,
    execute: spec.run,
  };
}

/** Global flags shared by all commands. */
export const GLOBAL_OPTIONS: OptionDef[] = [
  { flag: '--api-key <key>',              description: 'Temporary API key for this command only; auth login is the persistence path' },
  { flag: '--base-url <url>',             description: 'Temporary gateway base URL for this command only' },
  { flag: '--output <format>',            description: 'Output format: text, json' },
  { flag: '--timeout <seconds>',          description: 'Request timeout', type: 'number' },
  { flag: '--quiet',                      description: 'Suppress non-essential output', type: 'boolean' },
  { flag: '--verbose',                    description: 'Print HTTP request/response details', type: 'boolean' },
  { flag: '--no-color',                   description: 'Disable ANSI colors', type: 'boolean' },
  { flag: '--dry-run',                    description: 'Dry run mode', type: 'boolean' },
  { flag: '--non-interactive',            description: 'Disable interactive prompts', type: 'boolean' },
  { flag: '--help',                       description: 'Show help', type: 'boolean' },
  { flag: '--version',                    description: 'Print version', type: 'boolean' },
];
