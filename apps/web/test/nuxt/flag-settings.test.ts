import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import FlagSettings from '../../app/components/FlagSettings.vue';

const flag = {
  name: 'New checkout',
  description: 'Redesigned',
  clientVisible: false,
  archivedAt: null as string | null,
};
const mountSettings = (props: Record<string, unknown> = {}) =>
  mountSuspended(FlagSettings, {
    props: { flag, pending: false, ...props },
    attachTo: document.body,
  });

describe('FlagSettings', () => {
  it("starts with the flag's values and nothing to save", async () => {
    const wrapper = await mountSettings();
    expect((wrapper.get('#settings-name').element as HTMLInputElement).value).toBe('New checkout');
    expect((wrapper.get('#settings-description').element as HTMLTextAreaElement).value).toBe(
      'Redesigned',
    );
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('saves only what changed, trimmed', async () => {
    const wrapper = await mountSettings();
    await wrapper.get('#settings-name').setValue('  Checkout v2 ');
    await wrapper.get('input[type="checkbox"]').setValue(true);

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')).toEqual([[{ name: 'Checkout v2', clientVisible: true }]]);
  });

  it('explains what visible to client keys means', async () => {
    const wrapper = await mountSettings();
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('aria-describedby')).toBe('settings-client-hint');
    expect(wrapper.get('#settings-client-hint').text()).toContain('looks unknown to them');
  });

  it('refuses an empty name and focuses it', async () => {
    const wrapper = await mountSettings();
    await wrapper.get('#settings-name').setValue('  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.get('#settings-name').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#settings-name-error').text()).toBe('Enter a name.');
    expect(document.activeElement).toBe(wrapper.get('#settings-name').element);
  });

  it('refuses a description over 1000 characters', async () => {
    const wrapper = await mountSettings();
    await wrapper.get('#settings-description').setValue('d'.repeat(1001));
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.get('#settings-description-error').text()).toContain('1000');
  });

  it('follows the flag when it changes from outside', async () => {
    const wrapper = await mountSettings();
    await wrapper.setProps({ flag: { ...flag, name: 'Renamed elsewhere', clientVisible: true } });
    expect((wrapper.get('#settings-name').element as HTMLInputElement).value).toBe(
      'Renamed elsewhere',
    );
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
  });

  it('shows a server problem and a pending state', async () => {
    const wrapper = await mountSettings({ pending: true, error: 'Insufficient role' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Insufficient role');
    expect(wrapper.get('button[type="submit"]').text()).toBe('Saving…');
  });

  it('asks to archive an active flag', async () => {
    const wrapper = await mountSettings();
    expect(wrapper.text()).toContain('Its key stays reserved');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archive flag…')!
      .trigger('click');
    expect(wrapper.emitted('archive')).toHaveLength(1);
    expect(wrapper.findAll('button').some((b) => b.text() === 'Restore flag')).toBe(false);
  });

  it('offers to restore an archived flag, and locks the fields meanwhile', async () => {
    const wrapper = await mountSettings({
      flag: { ...flag, archivedAt: '2026-10-05T10:00:00.000Z' },
    });

    expect(wrapper.get('#settings-name').attributes('disabled')).toBeDefined();
    expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Restore flag')!
      .trigger('click');
    expect(wrapper.emitted('restore')).toHaveLength(1);
    expect(wrapper.findAll('button').some((b) => b.text() === 'Archive flag…')).toBe(false);
  });
});
