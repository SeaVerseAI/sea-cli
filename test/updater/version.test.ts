import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer } from '../../src/updater.ts';

describe('isNewer', () => {
  it('returns true when latest is greater than current', () => {
    assert.strictEqual(isNewer('v0.0.2', '0.0.1'), true);
    assert.strictEqual(isNewer('v1.0.0', '0.9.9'), true);
    assert.strictEqual(isNewer('v0.1.0', '0.0.9'), true);
  });

  it('returns false when latest equals current', () => {
    assert.strictEqual(isNewer('v0.0.1', '0.0.1'), false);
    assert.strictEqual(isNewer('v1.2.3', '1.2.3'), false);
  });

  it('returns false when latest is older than current', () => {
    assert.strictEqual(isNewer('v0.0.1', '0.0.2'), false);
    assert.strictEqual(isNewer('v0.9.9', '1.0.0'), false);
  });

  it('handles v prefix on either or both sides', () => {
    assert.strictEqual(isNewer('v1.0.0', 'v0.9.0'), true);
    assert.strictEqual(isNewer('1.0.0', '0.9.0'), true);
  });

  it('handles patch version differences', () => {
    assert.strictEqual(isNewer('v0.0.3', '0.0.2'), true);
    assert.strictEqual(isNewer('v0.0.2', '0.0.3'), false);
  });
});
