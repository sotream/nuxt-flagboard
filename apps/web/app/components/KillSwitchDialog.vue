<script setup lang="ts">
import { nextTick, onMounted, ref, useId, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  environment: string;
  flagName: string;
  pending: boolean;
  /** A problem from the server, shown inside the dialog. */
  error?: string;
}>();
const emit = defineEmits<{ confirm: [reason: string]; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const reasonInput = ref<HTMLTextAreaElement | null>(null);
const reason = ref('');
const reasonError = ref('');
const titleId = useId();
const descriptionId = useId();

/** A native <dialog> opened with showModal(): focus is trapped, the page behind is inert and Escape closes it. */
function show(): void {
  reason.value = '';
  reasonError.value = '';
  dialog.value?.showModal?.();
  void nextTick(() => reasonInput.value?.focus());
}

onMounted(() => {
  if (props.open) show();
});
watch(
  () => props.open,
  (open) => {
    if (open) show();
    else dialog.value?.close?.();
  },
);

function onSubmit(): void {
  const trimmed = reason.value.trim();
  if (trimmed === '' || trimmed.length > 500) {
    reasonError.value =
      trimmed === '' ? 'Say why you are switching it off.' : 'Use at most 500 characters.';
    reasonInput.value?.focus();
    return;
  }
  emit('confirm', trimmed);
}
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    class="m-auto w-full max-w-md rounded-xl border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    @cancel.prevent="emit('cancel')"
  >
    <form novalidate class="space-y-4 p-6" @submit.prevent="onSubmit">
      <h2 :id="titleId" class="text-lg font-semibold">
        Switch off {{ flagName }} in {{ environment }}?
      </h2>
      <p :id="descriptionId" class="text-sm text-slate-700 dark:text-slate-300">
        The kill switch makes this flag serve its off value in
        <strong>{{ environment }}</strong> straight away, whatever its rollout and rules say. Use it
        when something is wrong. The reason is kept in the audit log.
      </p>

      <p
        v-if="error"
        role="alert"
        class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        {{ error }}
      </p>

      <div>
        <label for="kill-reason" class="block text-sm font-medium">Reason</label>
        <textarea
          id="kill-reason"
          ref="reasonInput"
          v-model="reason"
          rows="3"
          maxlength="500"
          :aria-invalid="reasonError ? 'true' : undefined"
          :aria-describedby="reasonError ? 'kill-reason-error' : undefined"
          class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
        />
        <p
          v-if="reasonError"
          id="kill-reason-error"
          class="mt-1 text-sm text-red-700 dark:text-red-300"
        >
          {{ reasonError }}
        </p>
      </div>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          :disabled="pending"
          class="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ pending ? 'Switching off…' : 'Switch off now' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
