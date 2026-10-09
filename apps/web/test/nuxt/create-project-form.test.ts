import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import CreateProjectForm from '../../app/components/CreateProjectForm.vue';

const mountForm = (props: { pending?: boolean; error?: string } = {}) =>
  mountSuspended(CreateProjectForm, {
    props: { pending: false, ...props },
    attachTo: document.body,
  });

describe('CreateProjectForm', () => {
  it('fills in the key from the name until the person edits the key', async () => {
    const wrapper = await mountForm();

    await wrapper.get('#project-name').setValue('New Checkout');
    expect((wrapper.get('#project-key').element as HTMLInputElement).value).toBe('new-checkout');

    await wrapper.get('#project-key').setValue('checkout');
    await wrapper.get('#project-key').trigger('input');
    await wrapper.get('#project-name').setValue('Something else');
    expect((wrapper.get('#project-key').element as HTMLInputElement).value).toBe('checkout');
  });

  it('submits a trimmed name and the key', async () => {
    const wrapper = await mountForm();
    await wrapper.get('#project-name').setValue('  Billing Portal ');

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [{ key: 'billing-portal', name: 'Billing Portal' }],
    ]);
  });

  it('refuses an empty name and a key the API would reject, focusing the first problem', async () => {
    const wrapper = await mountForm();
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('#project-name').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#project-name-error').text()).toBe('Enter a name.');
    expect(document.activeElement).toBe(wrapper.get('#project-name').element);

    await wrapper.get('#project-name').setValue('Fine name');
    await wrapper.get('#project-key').setValue('Not A Key');
    await wrapper.get('#project-key').trigger('input');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('#project-key-error').text()).toContain('lower-case letters');
    expect(document.activeElement).toBe(wrapper.get('#project-key').element);
  });

  it('shows a server error as an alert, disables the button while pending and can be cancelled', async () => {
    const wrapper = await mountForm({
      pending: true,
      error: 'A project with this key already exists.',
    });

    expect(wrapper.get('[role="alert"]').text()).toContain('already exists');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.get('button[type="button"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
