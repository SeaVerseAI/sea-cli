import { CLIError } from './errors/base';
import { ExitCode } from './errors/codes';
import type { GlobalFlags } from './types/flags';
import type { OptionDef } from './command';

function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function flagKey(def: OptionDef): string | null {
  const m = def.flag.match(/^--([a-z][a-z0-9-]*)/i);
  return m ? kebabToCamel(m[1]!) : null;
}

function isBooleanDef(def: OptionDef): boolean {
  if (def.type === 'boolean') return true;
  if (def.type === 'string' || def.type === 'number' || def.type === 'array') return false;
  return !def.flag.includes('<') && !def.flag.includes('[');
}

interface FlagSchema {
  booleans: Set<string>;
  numbers: Set<string>;
  arrays: Set<string>;
  known: Set<string>;
}

function buildSchema(options: OptionDef[]): FlagSchema {
  const booleans = new Set<string>();
  const numbers = new Set<string>();
  const arrays = new Set<string>();
  const known = new Set<string>();
  for (const opt of options) {
    const key = flagKey(opt);
    if (!key) continue;
    known.add(key);
    if (isBooleanDef(opt)) booleans.add(key);
    else if (opt.type === 'number') numbers.add(key);
    else if (opt.type === 'array') arrays.add(key);
  }
  return { booleans, numbers, arrays, known };
}

export function scanCommandPath(
  argv: string[],
  globalOptions: OptionDef[] = [],
  commandRoots: string[] = [],
): string[] {
  const globalSchema = buildSchema(globalOptions);
  const path: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === '--') break;

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      const key = eqIdx !== -1 ? arg.slice(2, eqIdx) : arg.slice(2);
      const camelKey = kebabToCamel(key);
      const nextArg = argv[i + 1];
      const afterNextArg = argv[i + 2];
      const nextIsKnownCommandRoot = typeof nextArg === 'string' && commandRoots.includes(nextArg);
      const afterNextIsKnownCommandRoot = typeof afterNextArg === 'string' && commandRoots.includes(afterNextArg);

      if (
        eqIdx === -1 &&
        !globalSchema.booleans.has(camelKey) &&
        (path.length > 0 || globalSchema.known.has(camelKey))
      ) {
        i += 2;
      } else if (
        eqIdx === -1 &&
        path.length === 0 &&
        !globalSchema.known.has(camelKey) &&
        !nextIsKnownCommandRoot &&
        afterNextIsKnownCommandRoot
      ) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('-')) { i++; continue; }

    path.push(arg);
    i++;
  }
  return path;
}

export function parseFlags(argv: string[], options: OptionDef[]): GlobalFlags {
  const schema = buildSchema(options);
  const flags: GlobalFlags = {
    quiet: false,
    verbose: false,
    noColor: false,
    yes: false,
    dryRun: false,
    help: false,
    nonInteractive: false,
    async: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--help' || arg === '-h') { flags.help = true; i++; continue; }
    if (arg === '--') { break; }

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let key: string;
      let value: string | undefined;

      if (eqIdx !== -1) {
        key = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
      } else {
        key = arg.slice(2);
      }

      const camelKey = kebabToCamel(key);
      if (!schema.known.has(camelKey)) {
        throw new CLIError(
          `Unknown flag --${key}.`,
          ExitCode.USAGE,
        );
      }

      if (schema.booleans.has(camelKey)) {
        (flags as Record<string, unknown>)[camelKey] = true;
        i++;
        continue;
      }

      if (value === undefined) {
        i++;
        value = argv[i];
      }

      if (value === undefined) throw new Error(`Flag --${key} requires a value.`);

      if (schema.arrays.has(camelKey)) {
        const arr = (flags as Record<string, unknown>)[camelKey] as string[] | undefined;
        if (arr) arr.push(value);
        else (flags as Record<string, unknown>)[camelKey] = [value];
      } else if (schema.numbers.has(camelKey)) {
        (flags as Record<string, unknown>)[camelKey] = Number(value);
      } else {
        (flags as Record<string, unknown>)[camelKey] = value;
      }
    }

    i++;
  }

  return flags;
}
