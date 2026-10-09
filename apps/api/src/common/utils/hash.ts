import { createHash } from 'node:crypto';

/**
 * SHA-256 as hex. A fast hash is correct for refresh tokens and API keys: they are random with 256 bits or more
 * of entropy, so there is nothing to brute-force and a slow password hash would only add latency.
 */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
