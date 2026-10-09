<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { FLAG_FORM_FIELD_ORDER, validateNewFlag } from '~/utils/flag-form';
import type { FlagFormErrors } from '~/utils/flag-form';
import { slugify } from '~/utils/slugify';

export interface NewFlag {
  key: string;
  name: string;
  description: string;
  type: 'boolean' | 'string';
  onValue?: string;
  offValue?: string;
  clientVisible: boolean;
}

defineProps<{ pending: boolean; error?: string }>();
const emit = defineEmits<{ submit: [flag: NewFlag]; cancel: [] }>();

const name = ref('');
const key = ref('');
const keyEdited = ref(false);
const description = ref('');
const type = ref<'boolean' | 'string'>('boolean');
const onValue = ref('');
const offValue = ref('');
const clientVisible = ref(false);
const errors = ref<FlagFormErrors>({});
const fields: Record<string, ReturnType<typeof ref<HTMLInputElement | null>>> = {
  name: ref(null),
  key: ref(null),
  onValue: ref(null),
  offValue: ref(null),
};

watch(name, (value) => {
  if (!keyEdited.value) key.value = slugify(value);
});

async function onSubmit(): Promise<void> {
  errors.value = validateNewFlag({
    name: name.value,
    key: key.value,
    type: type.value,
    onValue: onValue.value,
    offValue: offValue.value,
  });
  const first = FLAG_FORM_FIELD_ORDER.find((field) => errors.value[field]);
  if (first) {
    await nextTick();
    fields[first]?.value?.focus();
    return;
  }
  emit('submit', {
    key: key.value,
    name: name.value.trim(),
    description: description.value.trim(),
    type: type.value,
    ...(type.value === 'string' ? { onValue: onValue.value, offValue: offValue.value } : {}),
    clientVisible: clientVisible.value,
  });
}

const inputClass = 'mt-1 block w-full rounded-sm border border-edge bg-surface h-8 px-2.5';
</script>

<template>
  <form
    novalidate
    class="space-y-4 rounded-md border border-line bg-surface p-4"
    aria-labelledby="new-flag-title"
    @submit.prevent="onSubmit"
  >
    <h2 id="new-flag-title" class="text-section font-semibold">New flag</h2>

    <p
      v-if="error"
      role="alert"
      class="flex items-start gap-2 rounded-sm border border-kill/40 bg-kill-subtle px-3 py-2 text-body text-ink"
    >
      <AppIcon name="warning" class="mt-0.5 shrink-0 text-danger" />
      <span>{{ error }}</span>
    </p>

    <div>
      <label for="flag-name" class="block text-body font-medium">Name</label>
      <input
        id="flag-name"
        :ref="(el) => (fields.name!.value = el as HTMLInputElement | null)"
        v-model="name"
        type="text"
        autocomplete="off"
        :aria-invalid="errors.name ? 'true' : undefined"
        :aria-describedby="errors.name ? 'flag-name-error' : undefined"
        :class="inputClass"
      />
      <p v-if="errors.name" id="flag-name-error" class="mt-1 text-body text-danger">
        <AppIcon name="warning" :size="12" />
        {{ errors.name }}
      </p>
    </div>

    <div>
      <label for="flag-key" class="block text-body font-medium">Key</label>
      <input
        id="flag-key"
        :ref="(el) => (fields.key!.value = el as HTMLInputElement | null)"
        v-model="key"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="flag-key-hint"
        :aria-invalid="errors.key ? 'true' : undefined"
        :class="[inputClass, 'font-mono text-body']"
        @input="keyEdited = true"
      />
      <p id="flag-key-hint" class="mt-1 text-body text-muted">
        What your code asks for. It cannot be changed later.
      </p>
      <p v-if="errors.key" id="flag-key-error" class="mt-1 text-body text-danger">
        <AppIcon name="warning" :size="12" />
        {{ errors.key }}
      </p>
    </div>

    <div>
      <label for="flag-description" class="block text-body font-medium"
        >Description (optional)</label
      >
      <textarea
        id="flag-description"
        v-model="description"
        rows="2"
        maxlength="1000"
        :class="[inputClass, 'h-auto py-1.5']"
      />
    </div>

    <fieldset>
      <legend class="text-body font-medium">Type</legend>
      <div class="mt-1 flex gap-6">
        <label class="flex items-center gap-2 text-body">
          <input v-model="type" type="radio" name="flag-type" value="boolean" /> Boolean (on or off)
        </label>
        <label class="flex items-center gap-2 text-body">
          <input v-model="type" type="radio" name="flag-type" value="string" /> String (two values)
        </label>
      </div>
    </fieldset>

    <div v-if="type === 'string'" class="grid gap-4 sm:grid-cols-2">
      <div>
        <label for="flag-on-value" class="block text-body font-medium">Value when on</label>
        <input
          id="flag-on-value"
          :ref="(el) => (fields.onValue!.value = el as HTMLInputElement | null)"
          v-model="onValue"
          type="text"
          autocomplete="off"
          :aria-invalid="errors.onValue ? 'true' : undefined"
          :aria-describedby="errors.onValue ? 'flag-on-value-error' : undefined"
          :class="inputClass"
        />
        <p v-if="errors.onValue" id="flag-on-value-error" class="mt-1 text-body text-danger">
          <AppIcon name="warning" :size="12" />
          {{ errors.onValue }}
        </p>
      </div>
      <div>
        <label for="flag-off-value" class="block text-body font-medium">Value when off</label>
        <input
          id="flag-off-value"
          :ref="(el) => (fields.offValue!.value = el as HTMLInputElement | null)"
          v-model="offValue"
          type="text"
          autocomplete="off"
          :aria-invalid="errors.offValue ? 'true' : undefined"
          :aria-describedby="errors.offValue ? 'flag-off-value-error' : undefined"
          :class="inputClass"
        />
        <p v-if="errors.offValue" id="flag-off-value-error" class="mt-1 text-body text-danger">
          <AppIcon name="warning" :size="12" />
          {{ errors.offValue }}
        </p>
      </div>
    </div>

    <div>
      <label class="flex items-center gap-2 text-body font-medium">
        <input v-model="clientVisible" type="checkbox" aria-describedby="client-visible-hint" />
        Visible to client keys
      </label>
      <p id="client-visible-hint" class="mt-1 text-body text-muted">
        Client keys are meant for browsers and apps. Leave this off for flags that only your servers
        should see.
      </p>
    </div>

    <div class="flex gap-3">
      <button
        type="submit"
        :disabled="pending"
        class="rounded-sm bg-accent h-8 px-3 font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ pending ? 'Creating…' : 'Create flag' }}
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
