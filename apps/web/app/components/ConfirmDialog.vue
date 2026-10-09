<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    pending?: boolean;
    /** A problem from the server, shown inside the dialog. */
    error?: string;
  }>(),
  { pending: false, error: undefined },
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const titleId = useId();
const descriptionId = useId();

/** A native <dialog> opened as a modal: focus is trapped, the page behind is inert, Escape cancels. */
function show(): void {
  dialog.value?.showModal?.();
  // The safe choice has focus first, so a stray Enter does not confirm a destructive action.
  cancelButton.value?.focus();
}

onMounted(() => {
  if (props.open) show();
});
watch(
  () => props.open,
  (open) => (open ? show() : dialog.value?.close?.()),
);
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    class="dialog-shadow m-auto w-full max-w-md rounded-md border border-line bg-surface p-0 text-ink backdrop:bg-ink/50"
    @cancel.prevent="emit('cancel')"
  >
    <div class="space-y-4 p-6">
      <h2 :id="titleId" class="text-section font-semibold">{{ title }}</h2>
      <p :id="descriptionId" class="text-body text-muted">
        {{ description }}
      </p>
      <p
        v-if="error"
        role="alert"
        class="flex items-start gap-2 rounded-sm border border-kill/40 bg-kill-subtle px-3 py-2 text-body text-ink"
      >
        <AppIcon name="warning" class="mt-0.5 shrink-0 text-danger" />
        <span>{{ error }}</span>
      </p>
      <div class="flex justify-end gap-3">
        <button
          ref="cancelButton"
          type="button"
          class="rounded-sm border border-edge h-8 px-3 font-medium hover:bg-subtle"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="pending"
          class="rounded-sm bg-kill h-8 px-3 font-medium text-kill-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          @click="emit('confirm')"
        >
          {{ pending ? 'Working…' : confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>
