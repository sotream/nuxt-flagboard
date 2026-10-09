import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { clearNuxtState } from '#imports';
import ThemeToggle from '../../app/components/ThemeToggle.vue';

describe('ThemeToggle', () => {
  beforeEach(() => {
    clearNuxtState(['theme-preference', 'theme-system-dark']); // state is shared by the whole test app
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('shows a decorative icon for the theme in use', async () => {
    const wrapper = await mountSuspended(ThemeToggle);
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('svg').html()).toContain('circle'); // the sun, while the theme is light
    document.documentElement.classList.remove('dark');
  });

  it('describes the current theme for screen readers and cycles on press', async () => {
    const wrapper = await mountSuspended(ThemeToggle);
    const button = wrapper.get('button');
    expect(button.attributes('aria-label')).toContain('Theme: system');

    await button.trigger('click');
    expect(button.attributes('aria-label')).toContain('Theme: light');
    await button.trigger('click');
    expect(button.attributes('aria-label')).toContain('Theme: dark');
  });

  it('puts the dark class on <html> and saves the choice', async () => {
    const wrapper = await mountSuspended(ThemeToggle);
    const button = wrapper.get('button');

    await button.trigger('click'); // light
    await button.trigger('click'); // dark
    await nextTick();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('flagboard-theme')).toBe('dark');

    await button.trigger('click'); // system (happy-dom reports light)
    await nextTick();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
