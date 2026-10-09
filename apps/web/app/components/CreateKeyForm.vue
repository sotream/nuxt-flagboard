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
    class="space-y-4 rounded-md border border-line bg-surface p-4"
    aria-labelledby="new-key-title"
    @submit.prevent="onSubmit"
  >
    <h2 id="new-key-title" class="text-section font-semibold">New API key</h2>

    <p
      v-if="error"
      role="alert"
      class="flex items-start gap-2 rounded-sm border border-kill/40 bg-kill-subtle px-3 py-2 text-body text-ink"
    >
      <AppIcon name="warning" class="mt-0.5 shrink-0 text-danger" />
      <span>{{ error }}</span>
    </p>

    <div>
      <label for="key-name" class="block text-body font-medium">Name</label>
      <input
        id="key-name"
        ref="nameInput"
        v-model="name"
        type="text"
        autocomplete="off"
        placeholder="Checkout service"
        :aria-invalid="nameError ? 'true' : undefined"
        :aria-describedby="nameError ? 'key-name-error' : undefined"
        class="mt-1 block w-full rounded-sm border border-edge bg-surface h-8 px-2.5"
      />
      <p
        v-if="nameError"
        id="key-name-error"
        class="mt-1 flex items-center gap-1.5 text-small font-medium text-danger"
      >
        <AppIcon name="warning" :size="12" />
        {{ nameError }}
      </p>
    </div>

    <div>
      <label for="key-environment" class="block text-body font-medium">Environment</label>
      <select
        id="key-environment"
        v-model="environment"
        class="mt-1 block w-full rounded-sm border border-edge bg-surface h-8 px-2.5"
      >
        <option v-for="key in ENVIRONMENT_KEYS" :key="key" :value="key">{{ key }}</option>
      </select>
      <p class="mt-1 text-small text-muted">
        A key only ever sees the environment it was made for.
      </p>
    </div>

    <fieldset>
      <legend class="text-body font-medium">Kind</legend>
      <div class="mt-2 space-y-2">
        <label class="flex items-start gap-2 text-body">
          <input v-model="kind" type="radio" name="key-kind" value="server" class="mt-1" />
          <span>
            <strong>Server</strong>: for your back end. Can read the full configuration (rules
            included) and evaluate. Keep it secret.
          </span>
        </label>
        <label class="flex items-start gap-2 text-body">
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
        class="rounded-sm bg-accent h-8 px-3 font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ pending ? 'Creating…' : 'Create key' }}
      </button>
      <button
        type="button"
        class="rounded-sm border border-edge h-8 px-3 font-medium hover:bg-subtle"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>
