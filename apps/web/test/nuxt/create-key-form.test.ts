import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import CreateKeyForm from '../../app/components/CreateKeyForm.vue';

const mountForm = (props: { pending?: boolean; error?: string } = {}) =>
  mountSuspended(CreateKeyForm, { props: { pending: false, ...props }, attachTo: document.body });

describe('CreateKeyForm', () => {
  it('defaults to a server key in dev and explains both kinds', async () => {
    const wrapper = await mountForm();
    expect((wrapper.get('#key-environment').element as HTMLSelectElement).value).toBe('dev');
    expect((wrapper.get('input[value="server"]').element as HTMLInputElement).checked).toBe(true);
    expect(wrapper.text()).toContain('Keep it secret');
    expect(wrapper.text()).toContain('never sees rules');
    expect(wrapper.findAll('#key-environment option').map((o) => o.text())).toEqual([
      'dev',
      'staging',
      'prod',
    ]);
  });

  it('submits the trimmed name, environment and kind', async () => {
    const wrapper = await mountForm();
    await wrapper.get('#key-name').setValue('  Web shop ');
    await wrapper.get('#key-environment').setValue('prod');
    await wrapper.get('input[value="client"]').setValue(true);

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [{ name: 'Web shop', environment: 'prod', kind: 'client' }],
    ]);
  });

  it('wants a name, and focuses the field when it is missing', async () => {
    const wrapper = await mountForm();
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('#key-name').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#key-name-error').text()).toBe('Enter a name.');
    expect(document.activeElement).toBe(wrapper.get('#key-name').element);
  });

  it('shows a server problem, disables the button while pending and can be cancelled', async () => {
    const wrapper = await mountForm({ pending: true, error: 'Could not create the key.' });
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not create');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.get('button[type="button"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
