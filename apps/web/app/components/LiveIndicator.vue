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
      evicted: 'Live updates paused: too many tabs',
    })[props.status],
);
const dot = computed(
  () =>
    ({
      connecting: 'bg-faint',
      live: 'bg-live motion-safe:animate-pulse',
      reconnecting: 'bg-warn',
      offline: 'bg-danger',
      evicted: 'bg-warn',
    })[props.status],
);
</script>

<template>
  <p class="inline-flex items-center gap-1.5 text-small text-muted" :data-status="status">
    <span aria-hidden="true" class="size-2 rounded-full" :class="dot" />
    <span><span class="sr-only">Live updates: </span>{{ text }}</span>
  </p>
</template>
