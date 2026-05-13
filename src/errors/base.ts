import { ExitCode } from './codes';

export class CLIError extends Error {
  readonly exitCode: ExitCode;
  readonly hint?: string;
  /** Optional task ID to surface when a poll/network failure interrupts a generation. */
  taskId?: string;

  constructor(message: string, exitCode: ExitCode = ExitCode.GENERAL, hint?: string) {
    super(message);
    this.name = 'CLIError';
    this.exitCode = exitCode;
    this.hint = hint;
  }

  toJSON() {
    return {
      error: {
        code: this.exitCode,
        message: this.message,
        ...(this.hint   ? { hint: this.hint }     : {}),
        ...(this.taskId ? { task_id: this.taskId } : {}),
      },
    };
  }
}
