import { describe, expect, it } from 'vitest';
import { withJitter } from './jitter.js';

describe('withJitter', () => {
  it('spreads the delay over plus or minus 10% of the interval', () => {
    expect(withJitter(1000, () => 0)).toBe(900);
    expect(withJitter(1000, () => 0.5)).toBe(1000);
    expect(withJitter(1000, () => 0.999999)).toBeCloseTo(1100, 2);
  });

  it('stays inside the bounds for any random value', () => {
    for (let step = 0; step < 1000; step++) {
      const delay = withJitter(60_000, () => step / 1000);
      expect(delay).toBeGreaterThanOrEqual(54_000);
      expect(delay).toBeLessThan(66_000);
    }
  });
});
