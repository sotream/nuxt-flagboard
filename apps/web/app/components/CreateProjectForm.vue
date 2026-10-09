<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { PROJECT_KEY_PATTERN, slugify } from '~/utils/slugify';

defineProps<{ pending: boolean; error?: string }>();
const emit = defineEmits<{ submit: [project: { key: string; name: string }]; cancel: [] }>();

const name = ref('');
const key = ref('');
const keyEdited = ref(false);
const nameError = ref('');
const keyError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
const keyInput = ref<HTMLInputElement | null>(null);

// The key follows the name until the person types in the key field themselves.
watch(name, (value) => {
  if (!keyEdited.value) key.value = slugify(value);
});

async function onSubmit(): Promise<void> {
  const trimmed = name.value.trim();
  nameError.value =
    trimmed === '' ? 'Enter a name.' : trimmed.length > 120 ? 'Use at most 120 characters.' : '';
  keyError.value =
    !PROJECT_KEY_PATTERN.test(key.value) || key.value.length > 64
      ? 'Use lower-case letters and digits, separated by single dashes (up to 64 characters).'
      : '';
  if (nameError.value || keyError.value) {
    await nextTick();
    (nameError.value ? nameInput.value : keyInput.value)?.focus();
    return;
  }
  emit('submit', { key: key.value, name: trimmed });
}
</script>

<template>
  <form
    novalidate
    class="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    aria-labelledby="new-project-title"
    @submit.prevent="onSubmit"
  >
    <h2 id="new-project-title" class="text-lg font-semibold">New project</h2>

    <p
      v-if="error"
      role="alert"
      class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {{ error }}
    </p>

    <div>
      <label for="project-name" class="block text-sm font-medium">Name</label>
      <input
        id="project-name"
        ref="nameInput"
        v-model="name"
        type="text"
        autocomplete="off"
        :aria-invalid="nameError ? 'true' : undefined"
        :aria-describedby="nameError ? 'project-name-error' : undefined"
        class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
      />
      <p
        v-if="nameError"
        id="project-name-error"
        class="mt-1 text-sm text-red-700 dark:text-red-300"
      >
        {{ nameError }}
      </p>
    </div>

    <div>
      <label for="project-key" class="block text-sm font-medium">Key</label>
      <input
        id="project-key"
        ref="keyInput"
        v-model="key"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="project-key-hint"
        :aria-invalid="keyError ? 'true' : undefined"
        class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
        @input="keyEdited = true"
      />
      <p id="project-key-hint" class="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Used in URLs and the API. It cannot be changed later.
      </p>
      <p v-if="keyError" id="project-key-error" class="mt-1 text-sm text-red-700 dark:text-red-300">
        {{ keyError }}
      </p>
    </div>

    <div class="flex gap-3">
      <button
        type="submit"
        :disabled="pending"
        class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ pending ? 'Creating…' : 'Create project' }}
      </button>
      <button
        type="button"
        class="rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>
