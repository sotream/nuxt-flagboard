<script setup lang="ts">
import { computed } from 'vue';
import type { FlagEnvironmentView } from '~/utils/api-types';
import { summarizeEnvironment } from '~/utils/flag-summary';

const props = defineProps<{ environment: FlagEnvironmentView }>();
const summary = computed(() => summarizeEnvironment(props.environment));

const tones = {
  danger:
    'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
  on: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100',
  partial:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
  off: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
} as const;
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
    :class="tones[summary.tone]"
  >
    <span class="font-mono uppercase opacity-70">{{ environment.environment }}</span>
    <span>{{ summary.label }}</span>
  </span>
</template>
