import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import type { ApiKeyView } from '../../app/utils/api-types';
import { createFakeSession } from './helpers/fake-session';
import type { FakeSession } from './helpers/fake-session';

const holder = vi.hoisted(() => ({ session: undefined as unknown }));
vi.mock('~/composables/useSession', () => ({ useSession: () => holder.session }));

import KeysPage from '../../app/pages/projects/[project]/keys.vue';

const FULL_KEY = `fb_srv_${'Z'.repeat(43)}`;
const key = (overrides: Partial<ApiKeyView> = {}): ApiKeyView => ({
  id: 'k1',
  name: 'Checkout service',
  kind: 'server',
  environment: 'prod',
  prefix: 'fb_srv_AbCd',
  createdAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
  createdByEmail: 'admin@example.com',
  ...overrides,
});

let session: FakeSession;
const URL = '/api/v1/projects/demo/keys';
const mountPage = () =>
  mountSuspended(KeysPage, { route: '/projects/demo/keys', attachTo: document.body });

beforeEach(() => {
  session = createFakeSession('admin');
  holder.session = session;
});

describe('API keys page', () => {
  it('lists keys with their prefix only, never a full key', async () => {
    session.request.mockResolvedValue([
      key(),
      key({
        id: 'k2',
        name: 'Web',
        kind: 'client',
        environment: 'dev',
        prefix: 'fb_cli_WxYz',
        revokedAt: '2026-10-05T10:00:00.000Z',
      }),
    ]);
    const wrapper = await mountPage();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('Checkout service');
    expect(rows[0]!.text()).toContain('fb_srv_AbCd…');
    expect(rows[0]!.text()).toContain('Active');
    expect(rows[0]!.text()).toContain('by admin@example.com');
    expect(rows[1]!.text()).toContain('Revoked');
    expect(rows[1]!.findAll('button')).toHaveLength(0); // nothing to revoke twice
    expect(wrapper.get('caption').text()).toBe('API keys of this project');
  });

  it('shows loading, empty and error states', async () => {
    session.request.mockReturnValueOnce(new Promise(() => undefined));
    expect((await mountPage()).get('[role="status"]').text()).toContain('Loading API keys');

    session.request.mockResolvedValueOnce([]);
    const empty = await mountPage();
    await flushPromises();
    expect(empty.text()).toContain('No API keys yet');

    session.request.mockRejectedValueOnce(new ApiError(500, 'The server failed'));
    const failed = await mountPage();
    await flushPromises();
    expect(failed.get('[role="alert"]').text()).toContain('The server failed');
    session.request.mockResolvedValue([key()]);
    await failed.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(failed.findAll('tbody tr')).toHaveLength(1);
  });

  it('lets a viewer look, but not create or revoke', async () => {
    session = createFakeSession('viewer');
    holder.session = session;
    session.request.mockResolvedValue([key()]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.findAll('button').filter((b) => b.text() === 'New key')).toHaveLength(0);
    expect(wrapper.find('[aria-label="Revoke Checkout service"]').exists()).toBe(false);
  });

  it('creates a key and shows it once, then forgets it', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New key')!
      .trigger('click');
    await wrapper.get('#key-name').setValue('Checkout service');
    await wrapper.get('input[value="server"]').setValue(true);
    session.request.mockClear();
    session.request.mockResolvedValueOnce({ ...key(), key: FULL_KEY }).mockResolvedValue([key()]);

    await wrapper.get('form[aria-labelledby="new-key-title"]').trigger('submit');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith(URL, {
      method: 'POST',
      body: { name: 'Checkout service', environment: 'dev', kind: 'server' },
    });
    expect((wrapper.get('#new-key').element as HTMLInputElement).value).toBe(FULL_KEY);
    expect(wrapper.get('dialog[aria-labelledby]').attributes('open')).toBeDefined();
    // the list reloaded and holds only the prefix
    expect(wrapper.get('tbody').text()).not.toContain(FULL_KEY);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'I have saved the key')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.html()).not.toContain(FULL_KEY); // gone from the page
  });

  it('keeps the form open and shows the problem when creating fails', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New key')!
      .trigger('click');
    await wrapper.get('#key-name').setValue('Checkout');
    session.request.mockRejectedValueOnce(new ApiError(403, 'Insufficient role'));

    await wrapper.get('form[aria-labelledby="new-key-title"]').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Insufficient role');
    expect(wrapper.find('#new-key-title').exists()).toBe(true);
  });

  it('asks before revoking, then revokes and reloads', async () => {
    session.request.mockResolvedValue([key()]);
    const wrapper = await mountPage();
    await flushPromises();

    await wrapper.get('[aria-label="Revoke Checkout service"]').trigger('click');
    const dialogs = wrapper.findAll('dialog');
    const confirm = dialogs.find((d) => d.text().includes('Revoke “Checkout service”?'))!;
    expect(confirm.attributes('open')).toBeDefined();
    expect(confirm.text()).toContain('cannot be undone');

    session.request.mockClear();
    session.request
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue([key({ revokedAt: '2026-10-09T10:00:00.000Z' })]);
    await confirm
      .findAll('button')
      .find((b) => b.text() === 'Revoke key')!
      .trigger('click');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith(`${URL}/k1`, { method: 'DELETE' });
    expect(wrapper.get('tbody').text()).toContain('Revoked');
  });

  it('does not revoke when the dialog is cancelled', async () => {
    session.request.mockResolvedValue([key()]);
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper.get('[aria-label="Revoke Checkout service"]').trigger('click');
    session.request.mockClear();

    const confirm = wrapper
      .findAll('dialog')
      .find((d) => d.text().includes('Revoke “Checkout service”?'))!;
    await confirm
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click');
    await flushPromises();

    expect(session.request).not.toHaveBeenCalled();
    expect(confirm.attributes('open')).toBeUndefined();
  });
});
