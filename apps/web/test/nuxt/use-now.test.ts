import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { msUntilMidnight, useNow } from '../../app/composables/useNow';

describe('msUntilMidnight', () => {
  it('counts the wall-clock time left in the day of the given time zone', () => {
    expect(msUntilMidnight(new Date('2026-10-09T23:59:50.000Z'), 'UTC')).toBe(10_000);
    expect(msUntilMidnight(new Date('2026-10-09T12:00:00.500Z'), 'UTC')).toBe(12 * 3_600_000 - 500);
    // 02:30 in Berlin on 9 October (summer time, UTC+2): 21 h 30 min to midnight.
    expect(msUntilMidnight(new Date('2026-10-09T00:30:00.000Z'), 'Europe/Berlin')).toBe(
      21.5 * 3_600_000,
    );
  });
});

describe('useNow', () => {
  const Probe = defineComponent({
    setup() {
      const now = useNow('UTC');
      return () => h('p', now.value.toISOString());
    },
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-10-09T23:59:50.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('moves to the new day when midnight passes, with no polling in between', async () => {
    const wrapper = await mountSuspended(Probe);
    expect(wrapper.text()).toBe('2026-10-09T23:59:50.000Z');
    expect(vi.getTimerCount()).toBe(1); // one timer to midnight, not an interval

    await vi.advanceTimersByTimeAsync(5_000);
    expect(wrapper.text()).toBe('2026-10-09T23:59:50.000Z'); // nothing happens before midnight

    await vi.advanceTimersByTimeAsync(6_000);
    await nextTick();
    expect(wrapper.text().startsWith('2026-10-10T00:00:')).toBe(true);
    expect(vi.getTimerCount()).toBe(1); // and the next midnight is already waiting
    wrapper.unmount();
  });

  it('catches up when the page becomes visible again after the computer slept', async () => {
    const wrapper = await mountSuspended(Probe);
    vi.setSystemTime(new Date('2026-10-10T08:00:00.000Z')); // timers did not run while asleep
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();

    expect(wrapper.text()).toBe('2026-10-10T08:00:00.000Z');
    wrapper.unmount();
  });

  it('does nothing while the page is hidden', async () => {
    const wrapper = await mountSuspended(Probe);
    vi.setSystemTime(new Date('2026-10-10T08:00:00.000Z'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();

    expect(wrapper.text()).toBe('2026-10-09T23:59:50.000Z');
    wrapper.unmount();
  });

  it('stops its timer and its listener when the component goes away', async () => {
    const wrapper = await mountSuspended(Probe);
    wrapper.unmount();

    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-10-10T08:00:00.000Z'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
  });
});
