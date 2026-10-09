<script setup lang="ts">
import { computed } from 'vue';
import { useColorMode } from '~/composables/useColorMode';

const { preference, theme, cycle } = useColorMode();

const label = computed(() => {
  const names = { system: 'system', light: 'light', dark: 'dark' } as const;
  return `Theme: ${names[preference.value]}${preference.value === 'system' ? ` (${theme.value})` : ''}. Press to change.`;
});
</script>

<template>
  <button
    type="button"
    class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
    :aria-label="label"
    @click="cycle"
  >
    <span aria-hidden="true">{{
      preference === 'system' ? 'Auto' : preference === 'light' ? 'Light' : 'Dark'
    }}</span>
  </button>
</template>
