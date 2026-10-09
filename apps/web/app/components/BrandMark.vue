<script setup lang="ts">
// A pole with a swallowtail pennant; the left part of the pennant is filled with the accent, like a rollout
// that has reached part of its users. The word "Flagboard" next to it names the product, so the mark is decorative.
withDefaults(defineProps<{ size?: number }>(), { size: 20 });
</script>

<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M3.5 2v12.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
    />
    <path d="M4.25 3.75H9.5V7.75H4.25z" fill="var(--accent)" />
    <path
      d="M3.5 3h8.5l-2 2.75 2 2.75H3.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      fill="none"
    />
  </svg>
</template>
