import { describe, expect, it } from 'vitest';
import { parseRetryAfter, MAX_RETRY_AFTER_MS } from './retry-after.js';

const NOW = Date.parse('2026-10-10T12:00:00Z');

describe('parseRetryAfter (RFC 9110 §10.2.3: HTTP-date / delay-seconds)', () => {
  it('reads delay-seconds', () => {
    expect(parseRetryAfter('30', NOW)).toBe(30_000);
    expect(parseRetryAfter('0', NOW)).toBe(0);
    expect(parseRetryAfter(' 5 ', NOW)).toBe(5_000);
  });

  it('reads an HTTP-date as the time from now until then', () => {
    expect(parseRetryAfter('Sat, 10 Oct 2026 12:01:30 GMT', NOW)).toBe(90_000);
  });

  it('treats a date in the past as no wait', () => {
    expect(parseRetryAfter('Sat, 10 Oct 2026 11:00:00 GMT', NOW)).toBe(0);
  });

  it('caps a very long wait, so a bad header cannot park the client for days', () => {
    expect(parseRetryAfter('86400', NOW)).toBe(MAX_RETRY_AFTER_MS);
    expect(parseRetryAfter('Mon, 10 Oct 2033 12:00:00 GMT', NOW)).toBe(MAX_RETRY_AFTER_MS);
  });

  it.each([
    ['nothing', null],
    ['an empty value', ''],
    ['a negative number', '-5'],
    ['a fraction', '1.5'],
    ['text', 'soon'],
    ['a number with a unit', '30s'],
    ['a huge number', '9'.repeat(40)],
  ])('ignores %s', (_label, value) => {
    expect(parseRetryAfter(value as string | null, NOW)).toBeUndefined();
  });
});
