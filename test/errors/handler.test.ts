import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handleError } from '../../src/errors/handler.ts';
import { CLIError } from '../../src/errors/base.ts';
import { ExitCode } from '../../src/errors/codes.ts';
import { setEffectiveOutputFormat } from '../../src/output/state.ts';

describe('handleError', () => {
  it('uses the resolved output format for JSON errors', () => {
    const writes: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    const originalExit = process.exit;

    setEffectiveOutputFormat('json');
    process.stderr.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      throw new Error(`EXIT:${code}`);
    }) as typeof process.exit;

    try {
      assert.throws(
        () => handleError(new CLIError('boom', ExitCode.USAGE, 'hint')),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.message, 'EXIT:2');
          return true;
        },
      );
    } finally {
      process.stderr.write = originalWrite;
      process.exit = originalExit;
      setEffectiveOutputFormat('text');
    }

    const parsed = JSON.parse(writes.join(''));
    assert.strictEqual(parsed.error.code, ExitCode.USAGE);
    assert.strictEqual(parsed.error.message, 'boom');
  });
});
