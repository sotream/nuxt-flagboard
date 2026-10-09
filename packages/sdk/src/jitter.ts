/** How far a polling delay may stray from the interval: 10% either way. */
export const JITTER_RATIO = 0.1;

/**
 * The delay before the next poll: the interval spread over +/-10%. Without it every SDK instance that started at
 * the same moment (after a deploy, say) would keep polling in lockstep and hit the API in bursts.
 * `random` returns a number in [0, 1).
 */
export function withJitter(intervalMs: number, random: () => number): number {
  return intervalMs * (1 - JITTER_RATIO + 2 * JITTER_RATIO * random());
}
