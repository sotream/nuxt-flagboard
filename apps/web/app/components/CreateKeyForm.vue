<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { ENVIRONMENT_KEYS } from '~/utils/api-types';
import type { EnvironmentKey } from '~/utils/api-types';

defineProps<{ pending: boolean; error?: string }>();
const emit = defineEmits<{
  submit: [key: { name: string; environment: EnvironmentKey; kind: 'server' | 'client' }];
  cancel: [];
}>();

const name = ref('');
const environment = ref<EnvironmentKey>('dev');
const kind = ref<'server' | 'client'>('server');
const nameError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

async function onSubmit(): Promise<void> {
  const trimmed = name.value.trim();
  nameError.value =
    trimmed === '' ? 'Enter a name.' : trimmed.length > 120 ? 'Use at most 120 characters.' : '';
  if (nameError.value) {
    await nextTick();
    nameInput.value?.focus();
    return;
  }
  emit('submit', { name: trimmed, environment: environment.value, kind: kind.value });
}
</script>

<template>
  <form
    novalidate
    class="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    aria-labelledby="new-key-title"
    @submit.prevent="onSubmit"
  >
    <h2 id="new-key-title" class="text-lg font-semibold">New API key</h2>

    <p
      v-if="error"
      role="alert"
      class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {{ error }}
    </p>

    <div>
      <label for="key-name" class="block text-sm font-medium">Name</label>
      <input
        id="key-name"
        ref="nameInput"
        v-model="name"
        type="text"
        autocomplete="off"
        placeholder="Checkout service"
        :aria-invalid="nameError ? 'true' : undefined"
        :aria-describedby="nameError ? 'key-name-error' : undefined"
        class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
      />
      <p v-if="nameError" id="key-name-error" class="mt-1 text-sm text-red-700 dark:text-red-300">
        {{ nameError }}
      </p>
    </div>

    <div>
      <label for="key-environment" class="block text-sm font-medium">Environment</label>
      <select
        id="key-environment"
        v-model="environment"
        class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
      >
        <option v-for="key in ENVIRONMENT_KEYS" :key="key" :value="key">{{ key }}</option>
      </select>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">
        A key only ever sees the environment it was made for.
      </p>
    </div>

    <fieldset>
      <legend class="text-sm font-medium">Kind</legend>
      <div class="mt-2 space-y-2">
        <label class="flex items-start gap-2 text-sm">
          <input v-model="kind" type="radio" name="key-kind" value="server" class="mt-1" />
          <span>
            <strong>Server</strong>: for your back end. Can read the full configuration (rules
            included) and evaluate. Keep it secret.
          </span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input v-model="kind" type="radio" name="key-kind" value="client" class="mt-1" />
          <span>
            <strong>Client</strong>: for browsers and apps. Can only evaluate flags marked “visible
            to client keys”; never sees rules.
          </span>
        </label>
      </div>
    </fieldset>

    <div class="flex gap-3">
      <button
        type="submit"
        :disabled="pending"
        class="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ pending ? 'Creating…' : 'Create key' }}
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
