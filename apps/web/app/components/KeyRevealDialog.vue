<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue';
import { copyText } from '~/utils/clipboard';

const props = defineProps<{
  /** The full key. It is shown here once and never again, so the parent drops it when this closes. */
  apiKey: string | null;
  name: string;
  kind: 'server' | 'client';
  environment: string;
}>();
const emit = defineEmits<{ done: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const keyField = ref<HTMLInputElement | null>(null);
const copied = ref<'idle' | 'copied' | 'failed'>('idle');
const titleId = useId();
const descriptionId = useId();

function show(): void {
  copied.value = 'idle';
  dialog.value?.showModal?.();
  keyField.value?.select();
}

onMounted(() => {
  if (props.apiKey) show();
});
watch(
  () => props.apiKey,
  (key) => (key ? show() : dialog.value?.close?.()),
);

async function copy(): Promise<void> {
  copied.value = (await copyText(props.apiKey ?? '')) ? 'copied' : 'failed';
}
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="descriptionId"
    class="m-auto w-full max-w-xl rounded-xl border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    @cancel.prevent
  >
    <div class="space-y-4 p-6">
      <h2 :id="titleId" class="text-lg font-semibold">Copy your new {{ kind }} key</h2>
      <p :id="descriptionId" class="text-sm text-slate-700 dark:text-slate-300">
        <strong>This is the only time the full key is shown.</strong> Flagboard stores only a hash
        of it, so it cannot be shown again. “{{ name }}” works in <strong>{{ environment }}</strong
        >.
        <span v-if="kind === 'server'">Keep it secret: it can read all flag rules.</span>
        <span v-else
          >It is safe to put in browser or app code: it can only evaluate client-visible
          flags.</span
        >
      </p>

      <div>
        <label for="new-key" class="block text-sm font-medium">API key</label>
        <input
          id="new-key"
          ref="keyField"
          :value="apiKey ?? ''"
          type="text"
          readonly
          spellcheck="false"
          autocomplete="off"
          class="mt-1 block w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          @click="copy"
        >
          Copy key
        </button>
        <p role="status" aria-live="polite" class="text-sm">
          <span v-if="copied === 'copied'" class="text-emerald-700 dark:text-emerald-300"
            >Copied to the clipboard.</span
          >
          <span v-else-if="copied === 'failed'" class="text-red-700 dark:text-red-300">
            Could not copy. Select the key above and copy it yourself.
          </span>
        </p>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
          @click="emit('done')"
        >
          I have saved the key
        </button>
      </div>
    </div>
  </dialog>
</template>
