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
    class="dialog-shadow m-auto w-full max-w-md rounded-md border border-line bg-surface p-0 text-ink backdrop:bg-ink/50"
    @cancel.prevent="emit('cancel')"
  >
    <form novalidate class="space-y-4 p-6" @submit.prevent="onSubmit">
      <h2 :id="titleId" class="flex items-center gap-2 text-section font-semibold">
        <AppIcon name="kill" class="shrink-0 text-danger" />
        <span class="wrap-anywhere">Switch off {{ flagName }} in {{ environment }}?</span>
      </h2>
      <p :id="descriptionId" class="text-small text-muted">
        The kill switch makes this flag serve its off value in
        <strong>{{ environment }}</strong> straight away, whatever its rollout and rules say. Use it
        when something is wrong. The reason is kept in the audit log.
      </p>

      <p
        v-if="error"
        role="alert"
        class="rounded-sm border border-kill/40 bg-kill-subtle px-3 py-2 text-body text-ink"
      >
        {{ error }}
      </p>

      <div>
        <label for="kill-reason" class="block text-body font-medium">Reason</label>
        <textarea
          id="kill-reason"
          ref="reasonInput"
          v-model="reason"
          rows="3"
          maxlength="500"
          :aria-invalid="reasonError ? 'true' : undefined"
          :aria-describedby="reasonError ? 'kill-reason-error' : undefined"
          class="mt-1 block w-full rounded-sm border border-edge bg-surface px-2.5 py-1.5"
        />
        <p
          v-if="reasonError"
          id="kill-reason-error"
          class="mt-1 text-small text-danger font-medium"
        >
          {{ reasonError }}
        </p>
      </div>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-sm border border-edge h-8 px-3 font-medium hover:bg-subtle"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="submit"
          :disabled="pending"
          class="rounded-sm bg-kill h-8 px-3 font-medium text-kill-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ pending ? 'Switching off…' : 'Switch off now' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
