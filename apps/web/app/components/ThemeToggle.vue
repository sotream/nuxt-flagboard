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
    class="inline-flex h-7 items-center gap-1.5 rounded-sm border border-edge px-2 text-small font-medium text-ink hover:bg-subtle"
    :aria-label="label"
    @click="cycle"
  >
    <AppIcon :name="theme === 'dark' ? 'moon' : 'sun'" />
    <span aria-hidden="true">{{
      preference === 'system' ? 'Auto' : preference === 'light' ? 'Light' : 'Dark'
    }}</span>
  </button>
</template>
