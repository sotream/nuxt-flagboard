<script setup lang="ts">
import { nextTick, ref } from 'vue';

defineProps<{
  /** True while the sign-in request is running. */
  pending: boolean;
  /** A problem from the server (wrong password, too many attempts), shown above the fields. */
  error?: string;
}>();

const emit = defineEmits<{ submit: [credentials: { email: string; password: string }] }>();

const email = ref('');
const password = ref('');
const emailError = ref('');
const passwordError = ref('');
const emailInput = ref<HTMLInputElement | null>(null);
const passwordInput = ref<HTMLInputElement | null>(null);

async function onSubmit(): Promise<void> {
  emailError.value = email.value.trim() === '' ? 'Enter your email address.' : '';
  passwordError.value = password.value === '' ? 'Enter your password.' : '';
  if (emailError.value || passwordError.value) {
    // Send keyboard and screen reader users to the first field that needs attention.
    await nextTick();
    (emailError.value ? emailInput.value : passwordInput.value)?.focus();
    return;
  }
  emit('submit', { email: email.value.trim(), password: password.value });
}
</script>

<template>
  <form novalidate class="space-y-5" aria-labelledby="login-title" @submit.prevent="onSubmit">
    <h1 id="login-title" class="text-2xl font-semibold">Sign in to Flagboard</h1>

    <p
      v-if="error"
      id="login-error"
      role="alert"
      class="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {{ error }}
    </p>

    <div>
      <label for="login-email" class="block text-sm font-medium">Email</label>
      <input
        id="login-email"
        ref="emailInput"
        v-model="email"
        type="email"
        autocomplete="username"
        :aria-invalid="emailError ? 'true' : undefined"
        :aria-describedby="emailError ? 'login-email-error' : undefined"
        class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
      />
      <p
        v-if="emailError"
        id="login-email-error"
        class="mt-1 text-sm text-red-700 dark:text-red-300"
      >
        {{ emailError }}
      </p>
    </div>

    <div>
      <label for="login-password" class="block text-sm font-medium">Password</label>
      <input
        id="login-password"
        ref="passwordInput"
        v-model="password"
        type="password"
        autocomplete="current-password"
        :aria-invalid="passwordError ? 'true' : undefined"
        :aria-describedby="passwordError ? 'login-password-error' : undefined"
        class="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
      />
      <p
        v-if="passwordError"
        id="login-password-error"
        class="mt-1 text-sm text-red-700 dark:text-red-300"
      >
        {{ passwordError }}
      </p>
    </div>

    <button
      type="submit"
      :disabled="pending"
      class="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {{ pending ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
