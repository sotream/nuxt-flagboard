<script setup lang="ts">
import { computed } from 'vue';
import type { FlagEnvironmentView } from '~/utils/api-types';
import { summarizeEnvironment } from '~/utils/flag-summary';

const props = defineProps<{ environment: FlagEnvironmentView }>();
const summary = computed(() => summarizeEnvironment(props.environment));

// Words carry the state; colour and the small meter only help.
const tones = {
  danger: 'bg-kill text-kill-fg',
  on: 'bg-on-subtle text-on',
  partial: 'bg-accent-subtle text-accent-ink',
  off: 'bg-subtle text-muted',
} as const;
</script>

<template>
  <span class="inline-flex min-w-32 flex-col gap-0.5">
    <span class="font-mono text-small text-faint">{{ environment.environment }}</span>
    <span
      class="inline-flex h-5 w-fit items-center gap-1.5 rounded-sm px-1.5 text-small font-medium whitespace-nowrap tabular-nums"
      :class="tones[summary.tone]"
    >
      <span
        v-if="summary.tone === 'partial'"
        class="meter h-1 w-[18px] rounded-sm"
        :style="{ '--p': `${environment.rolloutPercentage}%` }"
        aria-hidden="true"
      />
      {{ summary.label }}
    </span>
  </span>
</template>
