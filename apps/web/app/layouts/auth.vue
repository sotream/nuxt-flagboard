<template>
  <div class="flex min-h-screen items-center justify-center px-4">
    <main
      id="main"
      class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <slot />
      <div class="mt-6 flex justify-end">
        <ThemeToggle />
      </div>
    </main>
  </div>
</template>
