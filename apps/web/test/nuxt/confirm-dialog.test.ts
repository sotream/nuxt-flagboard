import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ConfirmDialog from '../../app/components/ConfirmDialog.vue';

const mountDialog = (props: Record<string, unknown> = {}) =>
  mountSuspended(ConfirmDialog, {
    props: {
      open: true,
      title: 'Revoke the key?',
      description: 'It stops working.',
      confirmLabel: 'Revoke key',
      ...props,
    },
    attachTo: document.body,
  });

describe('ConfirmDialog', () => {
  it('is a modal dialog with a title and description, and puts focus on the safe choice', async () => {
    const wrapper = await mountDialog();
    const dialog = wrapper.get('dialog');

    expect(dialog.attributes('open')).toBeDefined();
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe('Revoke the key?');
    expect(wrapper.get(`#${dialog.attributes('aria-describedby')}`).text()).toBe(
      'It stops working.',
    );
    expect(document.activeElement).toBe(wrapper.findAll('button')[0]!.element);
    expect(wrapper.findAll('button')[0]!.text()).toBe('Cancel');
  });

  it('confirms and cancels', async () => {
    const wrapper = await mountDialog();
    await wrapper.findAll('button')[1]!.trigger('click');
    await wrapper.findAll('button')[0]!.trigger('click');
    await wrapper.get('dialog').trigger('cancel'); // Escape

    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(2);
  });

  it('shows a problem, and a working state that disables the confirm button', async () => {
    const wrapper = await mountDialog({ pending: true, error: 'Could not revoke the key.' });
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not revoke the key.');
    expect(wrapper.findAll('button')[1]!.attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('button')[1]!.text()).toBe('Working…');
  });

  it('closes when the parent closes it, and is closed to begin with when not open', async () => {
    const wrapper = await mountDialog();
    await wrapper.setProps({ open: false });
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();

    const closed = await mountDialog({ open: false });
    expect(closed.get('dialog').attributes('open')).toBeUndefined();
  });
});
