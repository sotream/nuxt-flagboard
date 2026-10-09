<script setup lang="ts">
import { navigateTo } from '#imports';
import { useSession } from '~/composables/useSession';

const session = useSession();

async function signOut(): Promise<void> {
  await session.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="min-h-screen">
    <a
      href="#main"
      class="sr-only rounded bg-indigo-600 px-3 py-2 text-white focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
    >
      Skip to content
    </a>
    <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <nav aria-label="Main" class="flex items-center gap-6">
          <NuxtLink to="/" class="text-lg font-semibold tracking-tight">Flagboard</NuxtLink>
        </nav>
        <div class="flex items-center gap-3">
          <p v-if="session.state.user" class="text-sm text-slate-600 dark:text-slate-400">
            <span class="sr-only">Signed in as </span>{{ session.state.user.email }}
            <span
              class="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100"
            >
              {{ session.state.user.role }}
            </span>
          </p>
          <ThemeToggle />
          <button
            type="button"
            class="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            @click="signOut"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
    <main id="main" class="mx-auto max-w-6xl px-4 py-6">
      <slot />
    </main>
  </div>
</template>
