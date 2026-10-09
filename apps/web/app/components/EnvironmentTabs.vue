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
    class="flex gap-1 overflow-x-auto border-b border-line"
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
      class="-mb-px inline-flex items-center border-b-2 px-3.5 pb-2 pt-2 text-body font-medium whitespace-nowrap focus-visible:-outline-offset-2"
      :class="
        environment.key === modelValue
          ? 'border-accent text-ink'
          : 'border-transparent text-muted hover:text-ink'
      "
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      <span class="font-mono">{{ environment.key }}</span>
      <span class="sr-only">: </span>
      <span
        class="ml-2 text-small font-normal"
        :class="environment.key === modelValue ? 'text-accent-ink' : 'text-faint'"
        >{{ environment.status }}</span
      >
    </button>
  </div>
</template>
