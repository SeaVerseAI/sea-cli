import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanCommandPath, parseFlags } from '../../src/args.ts';
import { GLOBAL_OPTIONS } from '../../src/command.ts';

describe('scanCommandPath', () => {
  it('extracts simple command path', () => {
    const path = scanCommandPath(['generate', 'image', '--prompt', 'a cat'], GLOBAL_OPTIONS);
    assert.deepStrictEqual(path, ['generate', 'image']);
  });

  it('skips global boolean flags', () => {
    const path = scanCommandPath(['--quiet', 'chat', '--verbose'], GLOBAL_OPTIONS);
    assert.deepStrictEqual(path, ['chat']);
  });

  it('skips global flags with values', () => {
    const path = scanCommandPath(['--output', 'json', 'generate', 'image'], GLOBAL_OPTIONS);
    assert.deepStrictEqual(path, ['generate', 'image']);
  });

  it('stops at --', () => {
    const path = scanCommandPath(['chat', '--', 'extra'], GLOBAL_OPTIONS);
    assert.deepStrictEqual(path, ['chat']);
  });

  it('returns empty array for flag-only input', () => {
    const path = scanCommandPath(['--help'], GLOBAL_OPTIONS);
    assert.deepStrictEqual(path, []);
  });

  it('does not swallow the command path after an unknown long flag', () => {
    const path = scanCommandPath(['--bogus', 'generate', 'image'], GLOBAL_OPTIONS, ['generate']);
    assert.deepStrictEqual(path, ['generate', 'image']);
  });

  it('skips the detached value of an unknown long flag before the command path', () => {
    const path = scanCommandPath(['--bogus', 'value', 'generate', 'image'], GLOBAL_OPTIONS, ['generate']);
    assert.deepStrictEqual(path, ['generate', 'image']);
  });
});

describe('parseFlags', () => {
  it('parses string flag', () => {
    const flags = parseFlags(['--output', 'json'], GLOBAL_OPTIONS);
    assert.strictEqual(flags.output, 'json');
  });

  it('parses boolean flag', () => {
    const flags = parseFlags(['--quiet'], GLOBAL_OPTIONS);
    assert.strictEqual(flags.quiet, true);
  });

  it('parses multiple boolean flags', () => {
    const flags = parseFlags(['--quiet', '--verbose', '--no-color'], GLOBAL_OPTIONS);
    assert.strictEqual(flags.quiet, true);
    assert.strictEqual(flags.verbose, true);
    assert.strictEqual(flags.noColor, true);
  });

  it('converts kebab-case flag to camelCase', () => {
    const flags = parseFlags(['--no-color'], GLOBAL_OPTIONS);
    assert.strictEqual(flags.noColor, true);
  });

  it('parses --flag=value syntax', () => {
    const flags = parseFlags(['--output=json'], GLOBAL_OPTIONS);
    assert.strictEqual(flags.output, 'json');
  });

  it('parses --timeout as number', () => {
    const flags = parseFlags(['--timeout', '60'], GLOBAL_OPTIONS);
    assert.strictEqual(flags.timeout, 60);
  });

  it('defaults quiet/verbose/noColor to false', () => {
    const flags = parseFlags([], GLOBAL_OPTIONS);
    assert.strictEqual(flags.quiet, false);
    assert.strictEqual(flags.verbose, false);
    assert.strictEqual(flags.noColor, false);
  });

  it('parses array flag (repeatable)', () => {
    const messageOpt = [
      { flag: '--message <text>', description: 'message', type: 'array' as const },
    ];
    const flags = parseFlags(
      ['--message', 'hello', '--message', 'world'],
      [...GLOBAL_OPTIONS, ...messageOpt],
    );
    assert.deepStrictEqual(flags.message, ['hello', 'world']);
  });

  it('rejects unknown long flags', () => {
    assert.throws(
      () => parseFlags(['--bogus', 'value'], GLOBAL_OPTIONS),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Unknown flag --bogus'));
        return true;
      },
    );
  });
});
