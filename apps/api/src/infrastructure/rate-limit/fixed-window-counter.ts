interface Window {
  count: number;
  resetAt: number;
}

/**
 * Counts events per key in fixed time windows, in memory. It exists next to the throttler because `/v1` needs two
 * things a global throttler guard cannot do: count only failures, and key on the API key that the route's own
 * guard resolves. Counters reset on restart and are not shared between instances (see the single-instance ADR).
 */
export class FixedWindowCounter {
  private readonly windows = new Map<string, Window>();
  private lastPrune = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one event and returns how many happened in the current window. */
  hit(key: string): number {
    const now = this.now();
    // At most once per window: every entry is older than a window by then, so one pass clears everything that
    // expired, and a flood of distinct keys cannot make each hit scan the whole map.
    if (now - this.lastPrune >= this.windowMs) {
      this.prune(now);
      this.lastPrune = now;
    }
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return 1;
    }
    current.count += 1;
    return current.count;
  }

  /** How many keys are tracked right now (expired ones included until the next prune). */
  get size(): number {
    return this.windows.size;
  }

  /** How many events are in the current window, without recording one. */
  peek(key: string): number {
    const current = this.windows.get(key);
    return current && current.resetAt > this.now() ? current.count : 0;
  }

  /** Whole seconds until the window of `key` ends (at least 1). */
  retryAfterSeconds(key: string): number {
    const current = this.windows.get(key);
    return Math.max(1, Math.ceil(((current?.resetAt ?? this.now()) - this.now()) / 1000));
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
