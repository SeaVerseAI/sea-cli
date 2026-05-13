import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapApiError } from '../../src/errors/api.ts';
import { ExitCode } from '../../src/errors/codes.ts';

describe('mapApiError', () => {
  it('maps 401 to ExitCode.AUTH', () => {
    const err = mapApiError(401, {});
    assert.strictEqual(err.exitCode, ExitCode.AUTH);
    assert.ok(err.message.includes('401'));
  });

  it('maps 403 to ExitCode.AUTH', () => {
    const err = mapApiError(403, {});
    assert.strictEqual(err.exitCode, ExitCode.AUTH);
  });

  it('maps 429 to ExitCode.QUOTA', () => {
    const err = mapApiError(429, {});
    assert.strictEqual(err.exitCode, ExitCode.QUOTA);
    assert.ok(err.message.toLowerCase().includes('rate limit'));
  });

  it('maps 408 to ExitCode.TIMEOUT', () => {
    const err = mapApiError(408, {});
    assert.strictEqual(err.exitCode, ExitCode.TIMEOUT);
  });

  it('maps 504 to ExitCode.TIMEOUT', () => {
    const err = mapApiError(504, {});
    assert.strictEqual(err.exitCode, ExitCode.TIMEOUT);
  });

  it('maps unknown 5xx to ExitCode.GENERAL', () => {
    const err = mapApiError(500, {});
    assert.strictEqual(err.exitCode, ExitCode.GENERAL);
  });

  it('includes API error message from body', () => {
    const err = mapApiError(500, { error: { message: 'internal boom' } });
    assert.ok(err.message.includes('internal boom'));
  });

  it('includes URL in message when provided', () => {
    const err = mapApiError(401, {}, 'https://api.example.com/v1/test');
    assert.ok(err.message.includes('https://api.example.com/v1/test'));
  });
});
