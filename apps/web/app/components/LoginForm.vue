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
  <form novalidate class="space-y-4" aria-labelledby="login-title" @submit.prevent="onSubmit">
    <h1 id="login-title" class="text-section font-semibold">Sign in to Flagboard</h1>

    <p
      v-if="error"
      id="login-error"
      role="alert"
      class="flex items-start gap-2 rounded-md border border-kill/40 bg-kill-subtle px-3 py-2 text-body text-ink"
    >
      <AppIcon name="warning" class="mt-0.5 text-danger" />
      <span>{{ error }}</span>
    </p>

    <div>
      <label for="login-email" class="block text-body font-medium">Email</label>
      <input
        id="login-email"
        ref="emailInput"
        v-model="email"
        type="email"
        autocomplete="username"
        :aria-invalid="emailError ? 'true' : undefined"
        :aria-describedby="emailError ? 'login-email-error' : undefined"
        class="mt-1 block h-8 w-full rounded-sm border border-edge bg-surface px-2.5 text-body text-ink"
      />
      <p
        v-if="emailError"
        id="login-email-error"
        class="mt-1 flex items-center gap-1.5 text-small font-medium text-danger"
      >
        <AppIcon name="warning" :size="12" />
        {{ emailError }}
      </p>
    </div>

    <div>
      <label for="login-password" class="block text-body font-medium">Password</label>
      <input
        id="login-password"
        ref="passwordInput"
        v-model="password"
        type="password"
        autocomplete="current-password"
        :aria-invalid="passwordError ? 'true' : undefined"
        :aria-describedby="passwordError ? 'login-password-error' : undefined"
        class="mt-1 block h-8 w-full rounded-sm border border-edge bg-surface px-2.5 text-body text-ink"
      />
      <p
        v-if="passwordError"
        id="login-password-error"
        class="mt-1 flex items-center gap-1.5 text-small font-medium text-danger"
      >
        <AppIcon name="warning" :size="12" />
        {{ passwordError }}
      </p>
    </div>

    <button
      type="submit"
      :disabled="pending"
      class="h-8 w-full rounded-sm bg-accent px-4 text-body font-medium text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {{ pending ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
