import { getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';

/** A copy of `source` that follows it only after it has stopped changing for `delayMs`. */
export function useDebounced<T>(source: Ref<T>, delayMs: number): Ref<T> {
  const debounced = ref(source.value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(source, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      debounced.value = value;
    }, delayMs);
  });
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer));
  return debounced;
}
