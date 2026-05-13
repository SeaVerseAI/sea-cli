function parseVersion(v: string): number[] {
  return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}

export function updateInstructions(): string {
  return [
    'sac is distributed through npm and source checkouts.',
    '',
    'If you installed with npm, run:',
    '  npm install -g sac-cli@latest',
    '',
    'If you installed from source, run:',
    '  git pull && npm install && npm run build',
  ].join('\n');
}

export async function checkForUpdate(_currentVersion: string): Promise<void> {
  // npm is the canonical distribution path; avoid network checks on --version.
}

export async function selfUpdate(
  _currentVersion: string,
  opts: { quiet: boolean; force: boolean },
): Promise<void> {
  void opts.force;
  if (!opts.quiet) {
    process.stdout.write(`${updateInstructions()}\n`);
  }
}
