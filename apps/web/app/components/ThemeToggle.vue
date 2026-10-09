<script setup lang="ts">
import { computed } from 'vue';
import { useColorMode } from '~/composables/useColorMode';

const { preference, theme, cycle } = useColorMode();

// The text on the button and the start of its accessible name come from one place, so they cannot drift apart
// (WCAG 2.5.3, label in name: a person who says "Auto" to a voice control must hit this button).
const visibleText = computed(
  () => ({ system: 'Auto', light: 'Light', dark: 'Dark' })[preference.value],
);
const label = computed(() =>
  preference.value === 'system'
    ? `${visibleText.value} theme, following the system (currently ${theme.value}). Press to change.`
    : `${visibleText.value} theme. Press to change.`,
);
</script>

<template>
  <button
    type="button"
    class="inline-flex h-7 items-center gap-1.5 rounded-sm border border-edge px-2 text-small font-medium text-ink hover:bg-subtle"
    :aria-label="label"
    @click="cycle"
  >
    <AppIcon :name="theme === 'dark' ? 'moon' : 'sun'" />
    <span>{{ visibleText }}</span>
  </button>
</template>
