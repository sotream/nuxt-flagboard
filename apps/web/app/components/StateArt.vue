<script setup lang="ts">
// The pole and pennant of the brand, drawn large for empty and error states. Dashed while there is nothing to show,
// solid with a cross when something went wrong. Decorative: the text beside it says what happened.
withDefaults(defineProps<{ variant?: 'empty' | 'error'; size?: number }>(), {
  variant: 'empty',
  size: 56,
});
</script>

<template>
  <svg
    class="icon text-faint"
    :width="size"
    :height="size"
    viewBox="0 0 56 56"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M14 8v40" />
    <path d="M14 10h28l-6 8 6 8H14z" :stroke-dasharray="variant === 'empty' ? '3 4' : undefined" />
    <path v-if="variant === 'error'" d="M25 14l8 8M33 14l-8 8" class="stroke-danger" />
  </svg>
</template>
