import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KeyRevealDialog from '../../app/components/KeyRevealDialog.vue';

const KEY = `fb_srv_${'A'.repeat(43)}`;
const mountDialog = (props: Record<string, unknown> = {}) =>
  mountSuspended(KeyRevealDialog, {
    props: { apiKey: KEY, name: 'Checkout service', kind: 'server', environment: 'prod', ...props },
    attachTo: document.body,
  });

beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } });
});

describe('KeyRevealDialog', () => {
  it('shows the full key once, with the warning that it cannot be shown again', async () => {
    const wrapper = await mountDialog();

    expect((wrapper.get('#new-key').element as HTMLInputElement).value).toBe(KEY);
    expect(wrapper.get('#new-key').attributes('readonly')).toBeDefined();
    expect(wrapper.text()).toContain('This is the only time the full key is shown.');
    expect(wrapper.text()).toContain('Checkout service');
    expect(wrapper.text()).toContain('Keep it secret');
    expect(wrapper.get('dialog').attributes('open')).toBeDefined();
  });

  it('says a client key is safe for browsers and a server key is not', async () => {
    const client = await mountDialog({ kind: 'client' });
    expect(client.text()).toContain('safe to put in browser or app code');
    expect(client.text()).not.toContain('Keep it secret');
  });

  it('copies the key and says so, politely', async () => {
    const wrapper = await mountDialog();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copy key')!
      .trigger('click');
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(KEY);
    const status = wrapper.get('[role="status"]');
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.text()).toBe('Copied to the clipboard.');
  });

  it('says how to copy by hand when the browser refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    vi.stubGlobal('document', Object.assign(Object.create(document), { execCommand: () => false }));
    const wrapper = await mountDialog();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Copy key')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain(
      'Select the key above and copy it yourself',
    );
    vi.unstubAllGlobals();
  });

  it('is closed only by the person confirming they saved it, never by Escape', async () => {
    const wrapper = await mountDialog();

    const cancelEvent = new Event('cancel', { cancelable: true });
    wrapper.get('dialog').element.dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true); // Escape does not close it

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'I have saved the key')!
      .trigger('click');
    expect(wrapper.emitted('done')).toHaveLength(1);
  });

  it('closes when the parent drops the key, and keeps no copy of it', async () => {
    const wrapper = await mountDialog();
    await wrapper.setProps({ apiKey: null });
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
    expect((wrapper.get('#new-key').element as HTMLInputElement).value).toBe('');
    expect(wrapper.html()).not.toContain(KEY);
  });
});
