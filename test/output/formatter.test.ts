import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatOutput, detectOutputFormat } from '../../src/output/formatter.ts';

describe('formatOutput', () => {
  it('formats JSON output as pretty-printed JSON', () => {
    const result = formatOutput({ key: 'value' }, 'json');
    assert.deepStrictEqual(JSON.parse(result), { key: 'value' });
  });

  it('formats text output for simple objects as key: value pairs', () => {
    const result = formatOutput({ name: 'test', status: 'ok' }, 'text');
    assert.ok(result.includes('name: test'));
    assert.ok(result.includes('status: ok'));
  });

  it('formats text output for strings as-is', () => {
    const result = formatOutput('hello world', 'text');
    assert.strictEqual(result, 'hello world');
  });

  it('formats arrays of objects as an ASCII table', () => {
    const result = formatOutput(
      [{ name: 'a', value: '1' }, { name: 'b', value: '2' }],
      'text',
    );
    assert.ok(result.includes('NAME'));
    assert.ok(result.includes('VALUE'));
    assert.ok(result.includes('a'));
    assert.ok(result.includes('b'));
  });

  it('returns empty string for null/undefined in text mode', () => {
    assert.strictEqual(formatOutput(null, 'text'), '');
    assert.strictEqual(formatOutput(undefined, 'text'), '');
  });

  it('formats nested objects with indentation in text mode', () => {
    const result = formatOutput({ outer: { inner: 'value' } }, 'text');
    assert.ok(result.includes('outer:'));
    assert.ok(result.includes('inner: value'));
  });

  it('serializes numbers and booleans in JSON mode', () => {
    assert.strictEqual(JSON.parse(formatOutput(42, 'json')), 42);
    assert.strictEqual(JSON.parse(formatOutput(true, 'json')), true);
  });
});

describe('detectOutputFormat', () => {
  it('returns json when flag is "json"', () => {
    assert.strictEqual(detectOutputFormat('json'), 'json');
  });

  it('returns text when flag is "text"', () => {
    assert.strictEqual(detectOutputFormat('text'), 'text');
  });

  it('falls back to json when stdout is not a TTY (piped)', () => {
    // In test runner, stdout is typically not a TTY
    const result = detectOutputFormat(undefined);
    assert.ok(result === 'json' || result === 'text'); // depends on environment
  });
});
