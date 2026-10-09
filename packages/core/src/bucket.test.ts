import { describe, expect, it } from 'vitest';
import { BUCKETS, bucket } from './bucket.js';

// Golden pairs, computed with the Python `mmh3` package: mmh3.hash(f"{salt}:{userId}", 0, signed=False) % 10000.
// If one of these fails, the hash or the key format changed and every user would move to another rollout
// bucket. The API and every SDK must keep producing exactly these values.
const GOLDEN: [salt: string, userId: string, expected: number][] = [
  ['a1b2c3d4e5f60718293a4b5c6d7e8f90', 'user-1', 2999],
  ['a1b2c3d4e5f60718293a4b5c6d7e8f90', 'user-2', 5901],
  ['a1b2c3d4e5f60718293a4b5c6d7e8f90', 'user-42', 2568],
  ['00000000000000000000000000000000', 'alice', 1532],
  ['ffffffffffffffffffffffffffffffff', 'alice', 2183],
  ['00112233445566778899aabbccddeeff', 'юзер-😀', 3221],
];

describe('bucket', () => {
  it.each(GOLDEN)('puts %s + %s into bucket %i', (salt, userId, expected) => {
    expect(bucket(salt, userId)).toBe(expected);
  });

  it('places the same user in different buckets for different salts', () => {
    expect(bucket('00000000000000000000000000000000', 'alice')).not.toBe(
      bucket('ffffffffffffffffffffffffffffffff', 'alice'),
    );
  });

  it('spreads 100 000 users evenly: every decile holds 10% within one percentage point', () => {
    const deciles = new Array<number>(10).fill(0);
    const users = 100_000;
    for (let i = 0; i < users; i++) {
      const decile = Math.floor(
        bucket('a1b2c3d4e5f60718293a4b5c6d7e8f90', `user-${i}`) / (BUCKETS / 10),
      );
      deciles[decile] = (deciles[decile] ?? 0) + 1;
    }
    for (const count of deciles) {
      expect(Math.abs(count / users - 0.1)).toBeLessThan(0.01);
    }
  });
});
