import { describe, expect, it } from 'vitest';
import { murmur3 } from './murmur3.js';

// Published reference values (smhasher / Wikipedia), cross-checked with the Python `mmh3` package 5.3.1.
const VECTORS: [input: string, seed: number, expected: number][] = [
  ['', 0, 0x00000000],
  ['', 1, 0x514e28b7],
  ['', 0xffffffff, 0x81f16f39],
  ['test', 0, 0xba6bd213],
  ['abc', 0, 0xb3dd93fa],
  ['Hello, world!', 0, 0xc0363e43],
  ['The quick brown fox jumps over the lazy dog', 0, 0x2e4ff723],
  ['aaaa', 0x9747b28c, 0x5a97808a],
  ['Hello, world!', 0x9747b28c, 0x24884cba],
  ['The quick brown fox jumps over the lazy dog', 0x9747b28c, 0x2fa826cd],
  // Non-ASCII input is hashed as UTF-8 bytes.
  ['ключ', 0, 0x9a592042],
  ['😀', 0, 0xbeb42efa],
];

describe('murmur3', () => {
  it.each(VECTORS)('hashes %j with seed %i to the published value', (input, seed, expected) => {
    expect(murmur3(input, seed)).toBe(expected);
  });

  it('uses seed 0 by default', () => {
    expect(murmur3('test')).toBe(0xba6bd213);
  });

  it('returns an unsigned 32-bit integer', () => {
    const value = murmur3('some other input');
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});
