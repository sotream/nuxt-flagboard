<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { FlagView } from '~/utils/api-types';

const props = defineProps<{
  flag: Pick<FlagView, 'name' | 'description' | 'clientVisible' | 'archivedAt'>;
  pending: boolean;
  error?: string;
}>();
const emit = defineEmits<{
  save: [changes: { name?: string; description?: string; clientVisible?: boolean }];
  archive: [];
  restore: [];
}>();

const name = ref(props.flag.name);
const description = ref(props.flag.description);
const clientVisible = ref(props.flag.clientVisible);
const nameError = ref('');
const descriptionError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
const archived = computed(() => props.flag.archivedAt !== null);

// The form follows the flag when it changes from outside (saved here, or edited by someone else).
watch(
  () => props.flag,
  (flag) => {
    name.value = flag.name;
    description.value = flag.description;
    clientVisible.value = flag.clientVisible;
  },
);

/** Only the fields that differ from the flag, trimmed, so nothing unchanged is sent or audited. */
const changes = computed(() => {
  const result: { name?: string; description?: string; clientVisible?: boolean } = {};
  if (name.value.trim() !== props.flag.name) result.name = name.value.trim();
  if (description.value.trim() !== props.flag.description)
    result.description = description.value.trim();
  if (clientVisible.value !== props.flag.clientVisible) result.clientVisible = clientVisible.value;
  return result;
});
const dirty = computed(() => Object.keys(changes.value).length > 0);

async function onSubmit(): Promise<void> {
  const trimmed = name.value.trim();
  nameError.value =
    trimmed === '' ? 'Enter a name.' : trimmed.length > 120 ? 'Use at most 120 characters.' : '';
  descriptionError.value =
    description.value.trim().length > 1000 ? 'Use at most 1000 characters.' : '';
  if (nameError.value || descriptionError.value) {
    await nextTick();
    if (nameError.value) nameInput.value?.focus();
    return;
  }
  if (dirty.value) emit('save', changes.value);
}

const input =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950';
</script>

<template>
  <details
    class="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
  >
    <summary class="cursor-pointer px-4 py-3 font-medium">Flag settings</summary>
    <div class="space-y-6 border-t border-slate-200 p-4 dark:border-slate-800">
      <form novalidate class="space-y-4" aria-label="Flag settings" @submit.prevent="onSubmit">
        <p
          v-if="error"
          role="alert"
          class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {{ error }}
        </p>

        <div>
          <label for="settings-name" class="block text-sm font-medium">Name</label>
          <input
            id="settings-name"
            ref="nameInput"
            v-model="name"
            type="text"
            autocomplete="off"
            :disabled="archived"
            :aria-invalid="nameError ? 'true' : undefined"
            :aria-describedby="nameError ? 'settings-name-error' : undefined"
            :class="input"
          />
          <p
            v-if="nameError"
            id="settings-name-error"
            class="mt-1 text-sm text-red-700 dark:text-red-300"
          >
            {{ nameError }}
          </p>
        </div>

        <div>
          <label for="settings-description" class="block text-sm font-medium">Description</label>
          <textarea
            id="settings-description"
            v-model="description"
            rows="2"
            :disabled="archived"
            :aria-invalid="descriptionError ? 'true' : undefined"
            :aria-describedby="descriptionError ? 'settings-description-error' : undefined"
            :class="input"
          />
          <p
            v-if="descriptionError"
            id="settings-description-error"
            class="mt-1 text-sm text-red-700 dark:text-red-300"
          >
            {{ descriptionError }}
          </p>
        </div>

        <div>
          <label class="flex items-center gap-2 text-sm font-medium">
            <input
              v-model="clientVisible"
              type="checkbox"
              :disabled="archived"
              aria-describedby="settings-client-hint"
            />
            Visible to client keys
          </label>
          <p id="settings-client-hint" class="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Client keys, meant for browsers and apps, can only see and evaluate flags that have this
            on. A flag that is off here looks unknown to them.
          </p>
        </div>

        <button
          type="submit"
          :disabled="pending || archived || !dirty"
          class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ pending ? 'Saving…' : 'Save settings' }}
        </button>
      </form>

      <div class="border-t border-slate-200 pt-4 dark:border-slate-800">
        <h3 class="text-sm font-semibold">{{ archived ? 'Restore' : 'Archive' }}</h3>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
          <template v-if="archived">
            Bring this flag back. It will be served again with the settings it had when it was
            archived.
          </template>
          <template v-else>
            An archived flag is no longer served (SDKs see it as unknown) and cannot be edited until
            it is restored. Its key stays reserved.
          </template>
        </p>
        <button
          v-if="archived"
          type="button"
          :disabled="pending"
          class="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
          @click="emit('restore')"
        >
          Restore flag
        </button>
        <button
          v-else
          type="button"
          :disabled="pending"
          class="mt-2 rounded-md border border-red-400 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-950"
          @click="emit('archive')"
        >
          Archive flag…
        </button>
      </div>
    </div>
  </details>
</template>
