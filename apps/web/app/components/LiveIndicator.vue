<script setup lang="ts">
import { computed } from 'vue';
import type { StreamStatus } from '~/utils/event-stream';

const props = defineProps<{ status: StreamStatus }>();

const text = computed(
  () =>
    ({
      connecting: 'Connecting…',
      live: 'Live',
      reconnecting: 'Reconnecting…',
      offline: 'Live updates unavailable',
    })[props.status],
);
const dot = computed(
  () =>
    ({
      connecting: 'bg-slate-400',
      live: 'bg-emerald-500',
      reconnecting: 'bg-amber-500',
      offline: 'bg-red-500',
    })[props.status],
);
</script>

<template>
  <p
    class="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"
    :data-status="status"
  >
    <span aria-hidden="true" class="h-2 w-2 rounded-full" :class="dot" />
    <span><span class="sr-only">Live updates: </span>{{ text }}</span>
  </p>
</template>
