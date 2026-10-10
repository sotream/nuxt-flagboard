<template>
  <div class="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-6 py-10">
    <main id="main" class="w-full max-w-[19rem] pt-6 md:pt-16">
      <p class="mb-8 flex items-center gap-2.5 text-ink">
        <BrandMark :size="28" />
        <span class="text-title font-semibold">Flagboard</span>
      </p>
      <slot />
    </main>
    <div class="mt-auto pt-10">
      <ThemeToggle />
    </div>
  </div>
</template>
