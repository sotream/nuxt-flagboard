import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import CreateFlagForm from '../../app/components/CreateFlagForm.vue';

const mountForm = (props: { pending?: boolean; error?: string } = {}) =>
  mountSuspended(CreateFlagForm, { props: { pending: false, ...props }, attachTo: document.body });

describe('CreateFlagForm', () => {
  it('derives the key from the name until the key is edited', async () => {
    const wrapper = await mountForm();
    await wrapper.get('#flag-name').setValue('New Checkout');
    expect((wrapper.get('#flag-key').element as HTMLInputElement).value).toBe('new-checkout');

    await wrapper.get('#flag-key').setValue('checkout.v2');
    await wrapper.get('#flag-key').trigger('input');
    await wrapper.get('#flag-name').setValue('Other');
    expect((wrapper.get('#flag-key').element as HTMLInputElement).value).toBe('checkout.v2');
  });

  it('submits a boolean flag without values, not client-visible by default', async () => {
    const wrapper = await mountForm();
    await wrapper.get('#flag-name').setValue('Dark mode');

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toEqual([
      [
        {
          key: 'dark-mode',
          name: 'Dark mode',
          description: '',
          type: 'boolean',
          clientVisible: false,
        },
      ],
    ]);
  });

  it('has a client-visible checkbox with an explanation', async () => {
    const wrapper = await mountForm();
    const checkbox = wrapper.get('input[type="checkbox"]');
    expect(checkbox.attributes('aria-describedby')).toBe('client-visible-hint');
    expect(wrapper.get('#client-visible-hint').text()).toContain('browsers');

    await wrapper.get('#flag-name').setValue('Banner');
    await checkbox.setValue(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({ clientVisible: true });
  });

  it('shows the two value fields only for a string flag, and submits them', async () => {
    const wrapper = await mountForm();
    expect(wrapper.find('#flag-on-value').exists()).toBe(false);

    await wrapper.get('input[value="string"]').setValue(true);
    expect(wrapper.find('#flag-on-value').exists()).toBe(true);
    await wrapper.get('#flag-name').setValue('Button colour');
    await wrapper.get('#flag-on-value').setValue('blue');
    await wrapper.get('#flag-off-value').setValue('red');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')![0]![0]).toMatchObject({
      type: 'string',
      onValue: 'blue',
      offValue: 'red',
    });
  });

  it('explains each problem next to its field and focuses the first one', async () => {
    const wrapper = await mountForm();
    await wrapper.get('input[value="string"]').setValue(true);

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.get('#flag-name').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#flag-name-error').text()).toBe('Enter a name.');
    expect(wrapper.get('#flag-on-value').attributes('aria-describedby')).toBe(
      'flag-on-value-error',
    );
    expect(document.activeElement).toBe(wrapper.get('#flag-name').element);

    await wrapper.get('#flag-name').setValue('Ok');
    await wrapper.get('#flag-on-value').setValue('same');
    await wrapper.get('#flag-off-value').setValue('same');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.get('#flag-off-value-error').text()).toContain('different');
    expect(document.activeElement).toBe(wrapper.get('#flag-off-value').element);
  });

  it('shows a server error, disables the button while pending and can be cancelled', async () => {
    const wrapper = await mountForm({
      pending: true,
      error: 'A flag with this key already exists.',
    });
    expect(wrapper.get('[role="alert"]').text()).toContain('already exists');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.get('button[type="button"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
