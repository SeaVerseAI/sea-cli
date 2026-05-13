import { isInteractive } from './env.js';
import { CLIError } from '../errors/base.js';
import { ExitCode } from '../errors/codes';

export async function promptText(options: {
  message: string;
  defaultValue?: string;
}): Promise<string | undefined> {
  if (!isInteractive()) return undefined;

  const { defaultValue, message } = options;
  const inquirer = await import('@clack/prompts');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const val = await (inquirer as any).text({
    message,
    default: defaultValue,
    placeholder: defaultValue,
  });

  if (typeof val === 'symbol') return undefined;
  return val as string;
}

export async function promptConfirm(options: {
  message: string;
}): Promise<boolean | undefined> {
  if (!isInteractive()) return undefined;

  const { message } = options;
  const inquirer = await import('@clack/prompts');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const val = await (inquirer as any).confirm({ message });

  if (typeof val === 'symbol') return undefined;
  return val as boolean;
}

export function failIfMissing(flagName: string, context: string): never {
  throw new CLIError(
    `Missing required argument: --${flagName}\n` +
    `Hint: In non-interactive environments all required flags must be provided.\n` +
    `      In an interactive terminal, run without --${flagName} and the CLI will prompt for it.`,
    ExitCode.USAGE,
    context,
  );
}
