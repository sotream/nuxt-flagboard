import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import KillSwitchDialog from '../../app/components/KillSwitchDialog.vue';

const mountDialog = (props: Record<string, unknown> = {}) =>
  mountSuspended(KillSwitchDialog, {
    props: { open: true, environment: 'prod', flagName: 'New checkout', pending: false, ...props },
    attachTo: document.body,
  });

describe('KillSwitchDialog', () => {
  it('is a modal dialog with a title and a description, opened as a modal', async () => {
    const wrapper = await mountDialog();
    const dialog = wrapper.get('dialog');

    expect(dialog.attributes('open')).toBeDefined();
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(
      'Switch off New checkout in prod?',
    );
    expect(wrapper.get(`#${dialog.attributes('aria-describedby')}`).text()).toContain('audit log');
  });

  it('puts focus in the reason field', async () => {
    const wrapper = await mountDialog();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(wrapper.get('#kill-reason').element);
  });

  it('will not confirm without a reason, and says why', async () => {
    const wrapper = await mountDialog();

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('confirm')).toBeUndefined();
    expect(wrapper.get('#kill-reason').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('#kill-reason-error').text()).toBe('Say why you are switching it off.');
  });

  it('confirms with the trimmed reason', async () => {
    const wrapper = await mountDialog();
    await wrapper.get('#kill-reason').setValue('  Checkout errors spiking  ');

    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('confirm')).toEqual([['Checkout errors spiking']]);
  });

  it('cancels with the Cancel button and with Escape', async () => {
    const wrapper = await mountDialog();
    await wrapper.get('button[type="button"]').trigger('click');
    await wrapper.get('dialog').trigger('cancel'); // what the browser sends for Escape
    expect(wrapper.emitted('cancel')).toHaveLength(2);
  });

  it('shows a server problem and a pending state', async () => {
    const wrapper = await mountDialog({ pending: true, error: 'Someone else changed this first.' });
    expect(wrapper.get('[role="alert"]').text()).toContain('Someone else');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('closes when the parent closes it', async () => {
    const wrapper = await mountDialog();
    await wrapper.setProps({ open: false });
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
  });
});
