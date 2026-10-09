import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Ref } from 'vue';

/**
 * Wall-clock time left until the next midnight in `timeZone`. On a day that is 23 or 25 hours long it is off by an
 * hour, which only makes the timer fire early; it then sets itself again for what is left.
 */
export function msUntilMidnight(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(now);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const sinceMidnight = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  return 24 * 3_600_000 - sinceMidnight - now.getMilliseconds();
}

// A little past midnight, and never a tight loop if the clock reports a time that has not moved on yet.
const MARGIN_MS = 250;

/**
 * The current time as a ref that moves on at midnight of `timeZone`, and when the page becomes visible again (a
 * sleeping computer does not run timers). It is for labels such as "Today", which are wrong after midnight; it
 * does not tick every second: one timer waits for the next midnight.
 */
export function useNow(timeZone: string): Ref<Date> {
  const now = ref(new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;

  function refresh(): void {
    clearTimeout(timer);
    now.value = new Date();
    timer = setTimeout(refresh, msUntilMidnight(now.value, timeZone) + MARGIN_MS);
  }
  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') refresh();
  };

  onMounted(() => {
    refresh();
    document.addEventListener('visibilitychange', onVisibilityChange);
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
  return now;
}
