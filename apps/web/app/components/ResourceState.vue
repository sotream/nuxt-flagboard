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
      class="mb-4 flex items-start gap-4 rounded-md border border-kill/40 bg-kill-subtle p-4"
    >
      <StateArt variant="error" :size="40" />
      <div class="min-w-0">
        <p class="font-semibold text-ink">Could not load {{ label }}</p>
        <p v-if="error" class="mt-1 text-body text-ink wrap-anywhere">{{ error }}</p>
        <button
          type="button"
          class="mt-3 h-7 rounded-sm border border-edge bg-surface px-3 text-body font-medium text-ink hover:bg-subtle"
          @click="$emit('retry')"
        >
          Try again
        </button>
      </div>
    </div>

    <div v-if="!hasData && status !== 'error'" role="status" aria-live="polite" aria-busy="true">
      <span class="sr-only">Loading {{ label }}…</span>
      <ul
        class="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface"
        aria-hidden="true"
      >
        <li v-for="n in 3" :key="n" class="flex items-center justify-between gap-6 px-3 py-3.5">
          <span class="h-3 rounded-sm bg-subtle" :style="{ width: `${[38, 52, 30][n - 1]}%` }" />
          <span class="h-3 w-24 rounded-sm bg-subtle" />
        </li>
      </ul>
    </div>

    <div
      v-else-if="hasData && empty"
      class="flex flex-col items-start gap-1.5 rounded-md border border-dashed border-edge bg-surface p-6"
    >
      <StateArt class="mb-2" />
      <p class="font-semibold">{{ emptyTitle }}</p>
      <p v-if="emptyHint" class="text-body text-muted">
        {{ emptyHint }}
      </p>
      <div class="mt-2 flex">
        <slot name="empty-action" />
      </div>
    </div>

    <div v-else-if="hasData" :aria-busy="status === 'loading' ? 'true' : undefined">
      <slot />
    </div>
  </div>
</template>
