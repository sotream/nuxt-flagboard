interface Window {
  count: number;
  resetAt: number;
}

const PRUNE_ABOVE = 10_000;

/**
 * Counts events per key in fixed time windows, in memory. It exists next to the throttler because `/v1` needs two
 * things a global throttler guard cannot do: count only failures, and key on the API key that the route's own
 * guard resolves. Counters reset on restart and are not shared between instances (see the single-instance ADR).
 */
export class FixedWindowCounter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one event and returns how many happened in the current window. */
  hit(key: string): number {
    const now = this.now();
    if (this.windows.size > PRUNE_ABOVE) {
      this.prune(now);
    }
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return 1;
    }
    current.count += 1;
    return current.count;
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
