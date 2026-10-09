import { describe, expect, it } from 'vitest';
import {
  nextPreference,
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writePreference,
} from '../../app/utils/theme';

describe('resolveTheme', () => {
  it('follows the system when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the system when the user chose a theme', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextPreference', () => {
  it('cycles system, light, dark, system', () => {
    expect(nextPreference('system')).toBe('light');
    expect(nextPreference('light')).toBe('dark');
    expect(nextPreference('dark')).toBe('system');
  });
});

describe('readPreference', () => {
  const storageWith = (value: string | null) => ({
    getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null),
  });

  it('reads a saved preference', () => {
    expect(readPreference(storageWith('dark'))).toBe('dark');
    expect(readPreference(storageWith('light'))).toBe('light');
  });

  it.each([null, '', 'purple', '"dark"'])('falls back to system for %j', (value) => {
    expect(readPreference(storageWith(value))).toBe('system');
  });

  it('falls back to system when storage is missing or throws', () => {
    expect(readPreference(undefined)).toBe('system');
    expect(
      readPreference({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('system');
  });
});

describe('writePreference', () => {
  it('saves the preference under the shared key', () => {
    const saved = new Map<string, string>();
    writePreference({ setItem: (key, value) => void saved.set(key, value) }, 'dark');
    expect(saved.get(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('does not throw when storage is missing or full', () => {
    expect(() => writePreference(undefined, 'dark')).not.toThrow();
    expect(() =>
      writePreference(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        'dark',
      ),
    ).not.toThrow();
  });
});
