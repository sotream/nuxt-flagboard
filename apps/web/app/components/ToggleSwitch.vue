<script setup lang="ts">
import { useId } from 'vue';

defineProps<{
  modelValue: boolean;
  /** Visible label; also the accessible name. */
  label: string;
  disabled?: boolean;
  /** True while the change is being saved. */
  busy?: boolean;
  /** Id of text that explains the switch (for example why it is disabled). */
  describedby?: string;
}>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();

const labelId = useId();
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-labelledby="labelId"
      :aria-describedby="describedby"
      :aria-busy="busy ? 'true' : undefined"
      :disabled="disabled"
      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      :class="modelValue ? 'bg-emerald-600' : 'bg-slate-400 dark:bg-slate-600'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span
        aria-hidden="true"
        class="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
        :class="modelValue ? 'translate-x-5' : 'translate-x-0.5'"
      />
    </button>
    <span :id="labelId" class="text-sm font-medium">{{ label }}</span>
    <span aria-hidden="true" class="text-sm text-slate-600 dark:text-slate-400">
      {{ busy ? 'Saving…' : modelValue ? 'On' : 'Off' }}
    </span>
  </div>
</template>
