<script setup lang="ts">
import { ref } from 'vue';
import { panelId, tabId } from '~/utils/environment-ids';

const props = defineProps<{
  /** The environments, in display order, each with a short status for the tab. */
  environments: { key: string; status: string }[];
  modelValue: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [key: string] }>();

const buttons = ref<HTMLButtonElement[]>([]);

function select(index: number): void {
  const target = props.environments[index];
  if (!target) return;
  emit('update:modelValue', target.key);
  buttons.value[index]?.focus();
}

/** Arrow keys move between tabs (and wrap), Home and End jump to the ends: the keyboard pattern for tabs. */
function onKeydown(event: KeyboardEvent, index: number): void {
  const last = props.environments.length - 1;
  const next: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const target = next[event.key];
  if (target === undefined) return;
  event.preventDefault();
  select(target);
}
</script>

<template>
  <div
    role="tablist"
    aria-label="Environments"
    class="flex gap-1 border-b border-slate-200 dark:border-slate-800"
  >
    <button
      v-for="(environment, index) in environments"
      :id="tabId(environment.key)"
      :key="environment.key"
      :ref="(el) => (buttons[index] = el as HTMLButtonElement)"
      type="button"
      role="tab"
      :aria-selected="environment.key === modelValue"
      :aria-controls="panelId(environment.key)"
      :tabindex="environment.key === modelValue ? 0 : -1"
      class="-mb-px border-b-2 px-4 py-2 text-sm font-medium"
      :class="
        environment.key === modelValue
          ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
          : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      "
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      <span class="font-mono uppercase">{{ environment.key }}</span>
      <span class="sr-only">: </span>
      <span class="ml-2 text-xs font-normal">{{ environment.status }}</span>
    </button>
  </div>
</template>
