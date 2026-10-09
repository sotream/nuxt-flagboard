import { FixedWindowCounter } from './fixed-window-counter.js';

describe('FixedWindowCounter', () => {
  let now: number;
  let counter: FixedWindowCounter;

  beforeEach(() => {
    now = 1_000_000;
    counter = new FixedWindowCounter(60_000, () => now);
  });

  it('counts hits per key within a window', () => {
    expect(counter.hit('a')).toBe(1);
    expect(counter.hit('a')).toBe(2);
    expect(counter.hit('b')).toBe(1);
    expect(counter.peek('a')).toBe(2);
  });

  it('starts a fresh window once the old one ends', () => {
    counter.hit('a');
    counter.hit('a');
    now += 60_000;

    expect(counter.peek('a')).toBe(0);
    expect(counter.hit('a')).toBe(1);
  });

  it('does not change the count when peeking', () => {
    counter.hit('a');
    counter.peek('a');
    counter.peek('a');
    expect(counter.hit('a')).toBe(2);
  });

  it('reports the seconds left in the window, never less than one', () => {
    counter.hit('a');
    expect(counter.retryAfterSeconds('a')).toBe(60);
    now += 59_500;
    expect(counter.retryAfterSeconds('a')).toBe(1);
    expect(counter.retryAfterSeconds('unknown')).toBe(1);
  });

  it('forgets expired keys instead of growing without bound', () => {
    for (let i = 0; i < 10_001; i++) counter.hit(`key-${i}`);
    now += 60_000;
    counter.hit('trigger-prune');

    expect(counter.peek('key-0')).toBe(0);
    expect(counter.peek('trigger-prune')).toBe(1);
  });
});
