import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useState } from '#imports';
import { nextPreference, readPreference, resolveTheme, writePreference } from '~/utils/theme';
import type { Theme, ThemePreference } from '~/utils/theme';

/**
 * The theme: a saved preference (system, light or dark) resolved against the operating system setting, applied as
 * a class on <html>. `/theme-init.js` already did this before the first paint; this keeps it in sync afterwards.
 */
export function useColorMode() {
  const preference = useState<ThemePreference>('theme-preference', () =>
    readPreference(import.meta.client ? localStorage : undefined),
  );
  const systemDark = useState('theme-system-dark', () => false);
  const theme = computed<Theme>(() => resolveTheme(preference.value, systemDark.value));

  function apply(): void {
    document.documentElement.classList.toggle('dark', theme.value === 'dark');
  }

  onMounted(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    systemDark.value = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      systemDark.value = event.matches;
    };
    query.addEventListener('change', onChange);
    onBeforeUnmount(() => query.removeEventListener('change', onChange));
    apply();
  });
  watch(theme, () => {
    if (import.meta.client) apply();
  });

  function cycle(): void {
    preference.value = nextPreference(preference.value);
    writePreference(localStorage, preference.value);
  }

  return { preference, theme, cycle };
}
