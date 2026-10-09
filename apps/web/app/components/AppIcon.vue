<script setup lang="ts">
import { ICON_PATHS } from '~/utils/icons';
import type { IconName } from '~/utils/icons';

withDefaults(defineProps<{ name: IconName; size?: number; label?: string }>(), {
  size: 16,
  label: undefined,
});
</script>

<template>
  <!-- Decorative unless a label is given. The markup is the constant ICON_PATHS, never user input. -->
  <!-- eslint-disable vue/no-v-html -->
  <svg
    class="icon"
    viewBox="0 0 16 16"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    v-html="ICON_PATHS[name]"
  />
</template>
