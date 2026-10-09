import { murmur3 } from './murmur3.js';

/**
 * Number of rollout buckets. 10 000 (0.01% steps) lets rollout percentages become finer later without
 * moving any user: a user's bucket never changes, only the threshold does.
 */
export const BUCKETS = 10_000;

/** Stable bucket in `0..BUCKETS-1` for a user and a flag salt. The `salt:userId` key format is a contract. */
export function bucket(salt: string, userId: string): number {
  return murmur3(`${salt}:${userId}`) % BUCKETS;
}
