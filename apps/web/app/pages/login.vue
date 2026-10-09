<script setup lang="ts">
import { ref } from 'vue';
import { definePageMeta, navigateTo, useRoute } from '#imports';
import { useSession } from '~/composables/useSession';
import { ApiError } from '~/utils/api-error';
import { safeRedirect } from '~/utils/safe-redirect';

definePageMeta({ layout: 'auth' });

const session = useSession();
const route = useRoute();
const pending = ref(false);
const error = ref('');

function messageFor(problem: unknown): string {
  if (!(problem instanceof ApiError)) return 'Something went wrong. Try again.';
  if (problem.isNetworkError)
    return 'Could not reach the server. Check your connection and try again.';
  if (problem.status === 401) return 'Wrong email or password.';
  if (problem.status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (problem.status === 403)
    return 'The server did not accept this sign-in. Reload the page and try again.';
  return 'Could not sign in. Try again.';
}

async function signIn(credentials: { email: string; password: string }): Promise<void> {
  pending.value = true;
  error.value = '';
  try {
    await session.login(credentials.email, credentials.password);
    await navigateTo(safeRedirect(route.query.redirect));
  } catch (problem) {
    error.value = messageFor(problem);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <LoginForm :pending="pending" :error="error" @submit="signIn" />
</template>
