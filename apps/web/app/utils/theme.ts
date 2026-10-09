export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'flagboard-theme';
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

const isPreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/** What the page should look like for a preference, given what the operating system prefers. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return preference;
}

/** The next preference when the toggle is pressed: system, then light, then dark, then system again. */
export function nextPreference(preference: ThemePreference): ThemePreference {
  return ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length] ?? 'system';
}

/** Reads the saved preference. Storage can be missing or throw (private windows), which means "system". */
export function readPreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return isPreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the preference. Failing to save is fine: the choice still applies for this visit. */
export function writePreference(
  storage: Pick<Storage, 'setItem'> | undefined,
  preference: ThemePreference,
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignored on purpose
  }
}
