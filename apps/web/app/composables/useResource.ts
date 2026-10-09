import { ref } from 'vue';
import type { Ref } from 'vue';

export type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Loads something once and again on demand, and tracks where it is: loading, success or error. The previous data
 * stays while a reload runs (no flicker), and an answer that arrives after a newer request was started is ignored,
 * so typing quickly into a search box cannot show results for an older query.
 */
export function useResource<T>(load: () => Promise<T>, options: { immediate?: boolean } = {}) {
  const data = ref<T | undefined>(undefined) as Ref<T | undefined>;
  const status = ref<ResourceStatus>('idle');
  const error = ref<Error | undefined>(undefined);
  let latest = 0;

  async function reload(): Promise<void> {
    const mine = ++latest;
    status.value = 'loading';
    error.value = undefined;
    try {
      const value = await load();
      if (mine !== latest) return;
      data.value = value;
      status.value = 'success';
    } catch (problem) {
      if (mine !== latest) return;
      error.value = problem instanceof Error ? problem : new Error(String(problem));
      status.value = 'error';
    }
  }

  if (options.immediate !== false) {
    void reload();
  }
  return { data, status, error, reload };
}
