<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { describeRollout, parseRollout } from '~/utils/rollout';

const props = defineProps<{
  modelValue: number;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const id = useId();
const hintId = `${id}-hint`;
// What is typed in the number field, which may be half-written ("1" on the way to "15").
const typed = ref(String(props.modelValue));
const invalid = ref(false);
// The last value sent up, so typing a number and then leaving the field does not send it twice.
let sent = props.modelValue;

watch(
  () => props.modelValue,
  (value) => {
    sent = value;
    typed.value = String(value);
    invalid.value = false;
  },
);

function send(value: number): void {
  if (value === sent) return;
  sent = value;
  emit('update:modelValue', value);
}

const description = computed(() => describeRollout(props.modelValue));

function onSlide(event: Event): void {
  send(Number((event.target as HTMLInputElement).value));
}

/** While typing, a valid number updates the draft at once; an unfinished one waits for the field to lose focus. */
function onType(): void {
  const value = parseRollout(typed.value);
  invalid.value = typed.value.trim() !== '' && value === undefined;
  if (value !== undefined) send(value);
}

/** When the field is left, show the number that was actually taken (clamped, rounded) or restore the last good one. */
function onCommit(): void {
  const value = parseRollout(typed.value);
  typed.value = String(value ?? props.modelValue);
  invalid.value = false;
  if (value !== undefined) send(value);
}
</script>

<template>
  <div class="space-y-2">
    <label :for="`${id}-number`" class="block text-body font-medium">Rollout percentage</label>
    <div class="flex items-center gap-4">
      <input
        :id="`${id}-range`"
        type="range"
        min="0"
        max="100"
        step="1"
        :value="modelValue"
        :disabled="disabled"
        :aria-valuetext="`${modelValue} percent`"
        aria-label="Rollout percentage slider"
        :aria-describedby="hintId"
        :style="{ '--fill': `${modelValue}%` }"
        class="rollout-range grow"
        @input="onSlide"
      />
      <div class="flex items-center gap-1">
        <input
          :id="`${id}-number`"
          v-model="typed"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          :disabled="disabled"
          :aria-invalid="invalid ? 'true' : undefined"
          :aria-describedby="invalid ? `${id}-error` : hintId"
          class="h-10 w-[4.5rem] rounded-sm border border-edge bg-surface px-2 text-right text-figure"
          @input="onType"
          @change="onCommit"
          @blur="onCommit"
        />
        <span aria-hidden="true" class="text-section text-muted">%</span>
      </div>
    </div>
    <p v-if="invalid" :id="`${id}-error`" role="alert" class="text-small text-danger font-medium">
      Enter a whole number from 0 to 100.
    </p>
    <p :id="hintId" class="text-small text-muted">{{ description }}</p>
  </div>
</template>
