import { afterEach, vi } from 'vitest';
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

  describe('pruning', () => {
    const scans = () => vi.spyOn(Map.prototype, Symbol.iterator);

    afterEach(() => vi.restoreAllMocks());

    it('scans the entries at most once per window, however many keys and hits there are', () => {
      for (let i = 0; i < 20_000; i++) counter.hit(`key-${i}`); // far above any size threshold
      const spy = scans();

      for (let i = 0; i < 500; i++) counter.hit(`later-${i}`);
      expect(spy).not.toHaveBeenCalled(); // nothing scanned within the same window

      now += 60_000;
      counter.hit('after-window');
      expect(spy).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 500; i++) counter.hit(`again-${i}`);
      expect(spy).toHaveBeenCalledTimes(1); // still the one scan for this window
    });

    it('removes everything that expired when it does scan, whatever the size', () => {
      counter.hit('old');
      now += 60_000;
      counter.hit('new');

      expect(counter.size).toBe(1);
      expect(counter.peek('old')).toBe(0);
    });

    it('scans again in the next window', () => {
      counter.hit('a');
      now += 60_000;
      counter.hit('b'); // scan, a removed
      now += 30_000;
      counter.hit('c');
      now += 30_000; // 60 s after the last scan: b has expired
      counter.hit('d');

      expect(counter.size).toBe(2); // c and d; a and b were pruned
    });
  });
});
