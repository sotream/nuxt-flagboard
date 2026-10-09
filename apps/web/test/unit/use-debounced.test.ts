import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useDebounced } from '../../app/composables/useDebounced';

describe('useDebounced', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts with the current value and follows only after the source has been quiet', async () => {
    const source = ref('');
    const debounced = useDebounced(source, 250);

    source.value = 'p';
    await nextTick();
    vi.advanceTimersByTime(200);
    source.value = 'pa'; // typing again restarts the wait
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(debounced.value).toBe('');

    vi.advanceTimersByTime(60);
    expect(debounced.value).toBe('pa');
  });

  it('stops waiting when its scope ends, so a late timer cannot update a gone component', async () => {
    const source = ref('a');
    const scope = effectScope();
    const debounced = scope.run(() => useDebounced(source, 250))!;

    source.value = 'b';
    await nextTick();
    scope.stop();
    vi.advanceTimersByTime(1000);

    expect(debounced.value).toBe('a');
  });
});
