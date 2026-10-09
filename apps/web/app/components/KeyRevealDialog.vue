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
    class="dialog-shadow m-auto w-full max-w-xl rounded-md border border-line bg-surface p-0 text-ink backdrop:bg-ink/50"
    @cancel.prevent
  >
    <div class="space-y-4 p-6">
      <h2 :id="titleId" class="text-section font-semibold">Copy your new {{ kind }} key</h2>
      <p :id="descriptionId" class="text-small text-muted">
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
        <label for="new-key" class="block text-body font-medium">API key</label>
        <input
          id="new-key"
          ref="keyField"
          :value="apiKey ?? ''"
          type="text"
          readonly
          spellcheck="false"
          autocomplete="off"
          class="mt-1 block w-full rounded-sm border border-edge bg-subtle h-8 px-2.5 font-mono text-body"
          @focus="($event.target as HTMLInputElement).select()"
        />
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-sm border border-edge px-3 font-medium hover:bg-subtle"
          @click="copy"
        >
          <AppIcon name="copy" />
          Copy key
        </button>
        <p role="status" aria-live="polite" class="text-body">
          <span v-if="copied === 'copied'" class="text-on">Copied to the clipboard.</span>
          <span v-else-if="copied === 'failed'" class="text-danger">
            Could not copy. Select the key above and copy it yourself.
          </span>
        </p>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-sm bg-accent h-8 px-3 font-medium text-accent-fg hover:opacity-90"
          @click="emit('done')"
        >
          I have saved the key
        </button>
      </div>
    </div>
  </dialog>
</template>
