const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

const rotl = (x: number, r: number): number => (x << r) | (x >>> (32 - r));

const mixK = (k: number): number => Math.imul(rotl(Math.imul(k, C1), 15), C2);

/**
 * MurmurHash3, 32-bit x86 variant, over the UTF-8 bytes of `input`. Returns an unsigned 32-bit integer.
 * It is synchronous and runs unchanged in Node and in browsers, unlike `node:crypto`. The same input must
 * always give the same output, so the API and every SDK put users in the same rollout bucket.
 */
export function murmur3(input: string, seed = 0): number {
  const data = new TextEncoder().encode(input);
  const length = data.length;
  const blocksEnd = length - (length & 3);
  let h = seed >>> 0;

  for (let i = 0; i < blocksEnd; i += 4) {
    const k = data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24);
    h ^= mixK(k);
    h = (Math.imul(rotl(h, 13), 5) + 0xe6546b64) | 0;
  }

  const remaining = length & 3;
  let tail = 0;
  if (remaining >= 3) tail ^= data[blocksEnd + 2]! << 16;
  if (remaining >= 2) tail ^= data[blocksEnd + 1]! << 8;
  if (remaining >= 1) {
    tail ^= data[blocksEnd]!;
    h ^= mixK(tail);
  }

  h ^= length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
