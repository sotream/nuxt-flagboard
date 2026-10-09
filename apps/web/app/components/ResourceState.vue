<script setup lang="ts">
import type { ResourceStatus } from '~/composables/useResource';

/**
 * The three states every data view needs besides "here it is": loading (a skeleton the screen reader announces),
 * empty (with a hint and an optional action) and error (an alert with a retry button).
 * Stale data stays on screen while a reload runs or fails, so the page does not jump.
 */
withDefaults(
  defineProps<{
    status: ResourceStatus;
    /** True once data has arrived at least once. */
    hasData: boolean;
    /** True when the data arrived but there is nothing to list. */
    empty?: boolean;
    /** What went wrong, in words for the user. */
    error?: string;
    emptyTitle?: string;
    emptyHint?: string;
    /** What is being loaded, for the screen reader: "projects". */
    label?: string;
  }>(),
  {
    empty: false,
    error: undefined,
    emptyTitle: 'Nothing here yet',
    emptyHint: undefined,
    label: 'content',
  },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <div>
    <div
      v-if="status === 'error'"
      role="alert"
      class="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950"
    >
      <p class="font-medium text-red-900 dark:text-red-100">Could not load {{ label }}</p>
      <p v-if="error" class="mt-1 text-sm text-red-800 dark:text-red-200">{{ error }}</p>
      <button
        type="button"
        class="mt-3 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 dark:border-red-700 dark:text-red-100 dark:hover:bg-red-900"
        @click="$emit('retry')"
      >
        Try again
      </button>
    </div>

    <div v-if="!hasData && status !== 'error'" role="status" aria-live="polite" aria-busy="true">
      <span class="sr-only">Loading {{ label }}…</span>
      <ul class="space-y-3" aria-hidden="true">
        <li
          v-for="n in 3"
          :key="n"
          class="h-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800"
        />
      </ul>
    </div>

    <div
      v-else-if="hasData && empty"
      class="rounded-lg border border-dashed border-slate-300 p-8 text-center dark:border-slate-700"
    >
      <p class="font-medium">{{ emptyTitle }}</p>
      <p v-if="emptyHint" class="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {{ emptyHint }}
      </p>
      <div class="mt-4 flex justify-center">
        <slot name="empty-action" />
      </div>
    </div>

    <div v-else-if="hasData" :aria-busy="status === 'loading' ? 'true' : undefined">
      <slot />
    </div>
  </div>
</template>
