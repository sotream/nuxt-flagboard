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
    class="m-auto w-full max-w-md rounded-xl border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    @cancel.prevent="emit('cancel')"
  >
    <div class="space-y-4 p-6">
      <h2 :id="titleId" class="text-lg font-semibold">{{ title }}</h2>
      <p :id="descriptionId" class="text-sm text-slate-700 dark:text-slate-300">
        {{ description }}
      </p>
      <p
        v-if="error"
        role="alert"
        class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      >
        {{ error }}
      </p>
      <div class="flex justify-end gap-3">
        <button
          ref="cancelButton"
          type="button"
          class="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="pending"
          class="rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          @click="emit('confirm')"
        >
          {{ pending ? 'Working…' : confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>
