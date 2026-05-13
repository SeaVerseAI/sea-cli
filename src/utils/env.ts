export function isInteractive(options?: { nonInteractive?: boolean }): boolean {
  if (options?.nonInteractive === true) return false;
  if (process.env.CI) return false;
  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}
