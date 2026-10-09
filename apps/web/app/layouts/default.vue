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
      class="sr-only rounded-sm bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
    >
      Skip to content
    </a>
    <header class="border-b border-line bg-surface">
      <div
        class="mx-auto flex min-h-11 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-6 py-1.5"
      >
        <nav aria-label="Main" class="flex items-center">
          <NuxtLink to="/" class="flex items-center gap-2 rounded-sm text-ink">
            <BrandMark />
            <span class="text-section font-semibold tracking-tight">Flagboard</span>
          </NuxtLink>
        </nav>
        <span class="hidden flex-1 sm:block" aria-hidden="true" />
        <p v-if="session.state.user" class="flex min-w-0 items-center gap-2 text-small text-muted">
          <span class="sr-only">Signed in as </span>
          <span class="sr-only md:not-sr-only md:wrap-anywhere">{{
            session.state.user.email
          }}</span>
          <span class="rounded-sm border border-line px-1.5 text-ink">
            {{ session.state.user.role }}
          </span>
        </p>
        <ThemeToggle />
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-sm border border-edge px-2 text-small font-medium text-ink hover:bg-subtle"
          @click="signOut"
        >
          <AppIcon name="logout" />
          Sign out
        </button>
      </div>
    </header>
    <main id="main" class="mx-auto max-w-6xl px-6 py-6">
      <slot />
    </main>
  </div>
</template>
