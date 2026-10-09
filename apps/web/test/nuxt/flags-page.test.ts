import { flushPromises } from '@vue/test-utils';
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import type { FlagView } from '../../app/utils/api-types';
import { createFakeSession } from './helpers/fake-session';
import type { FakeSession } from './helpers/fake-session';

const holder = vi.hoisted(() => ({
  session: undefined as unknown,
  navigateTo: undefined as unknown,
}));
vi.mock('~/composables/useSession', () => ({ useSession: () => holder.session }));
mockNuxtImport(
  'navigateTo',
  () =>
    (...args: unknown[]) =>
      (holder.navigateTo as (...a: unknown[]) => unknown)(...args),
);

import FlagsPage from '../../app/pages/projects/[project]/index.vue';

const environments = (overrides: Record<string, unknown> = {}) =>
  (['dev', 'staging', 'prod'] as const).map((environment) => ({
    environment,
    enabled: false,
    rolloutPercentage: 0,
    rules: [],
    killSwitch: false,
    killReason: null,
    revision: 1,
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  }));
const flag = (key: string, overrides: Partial<FlagView> = {}): FlagView =>
  ({
    key,
    name: key,
    description: '',
    type: 'boolean',
    onValue: true,
    offValue: false,
    clientVisible: false,
    archivedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    environments: environments(),
    ...overrides,
  }) as FlagView;

let session: FakeSession;
const mountPage = () => mountSuspended(FlagsPage, { route: '/projects/demo' });
const URL = '/api/v1/projects/demo/flags';

beforeEach(() => {
  session = createFakeSession('admin');
  holder.session = session;
  holder.navigateTo = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe('flags page', () => {
  it('lists flags with their badges and the state of every environment', async () => {
    session.request.mockResolvedValue([
      flag('new-checkout', {
        name: 'New checkout',
        description: 'Redesigned checkout',
        clientVisible: true,
        environments: environments({ enabled: true, rolloutPercentage: 25 }),
      }),
      flag('old', { archivedAt: '2026-10-02T10:00:00.000Z' }),
    ]);
    const wrapper = await mountPage();
    await flushPromises();

    const links = wrapper.findAll('ul a');
    expect(links.map((l) => l.attributes('href'))).toEqual([
      '/projects/demo/flags/new-checkout',
      '/projects/demo/flags/old',
    ]);
    const first = links[0]!.text();
    expect(first).toContain('New checkout');
    expect(first).toContain('client-visible');
    expect(first).toContain('Redesigned checkout');
    expect(first).toContain('On · 25%');
    expect(links[1]!.text()).toContain('archived');
    expect(session.request).toHaveBeenCalledWith(URL, {
      query: { search: '', includeArchived: undefined },
    });
  });

  it('shows loading, then an error with retry', async () => {
    session.request.mockReturnValueOnce(new Promise(() => undefined));
    const loading = await mountPage();
    expect(loading.get('[role="status"]').text()).toContain('Loading flags');

    session.request.mockRejectedValueOnce(new ApiError(500, 'The server failed'));
    const failed = await mountPage();
    await flushPromises();
    expect(failed.get('[role="alert"]').text()).toContain('The server failed');

    session.request.mockResolvedValue([flag('a')]);
    await failed.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(failed.findAll('ul a')).toHaveLength(1);
  });

  it('shows an empty state with a create action for an admin and a hint for a viewer', async () => {
    session.request.mockResolvedValue([]);
    const admin = await mountPage();
    await flushPromises();
    expect(admin.text()).toContain('No flags yet');
    expect(admin.findAll('button').filter((b) => b.text() === 'New flag').length).toBeGreaterThan(
      0,
    );

    session = createFakeSession('viewer');
    holder.session = session;
    session.request.mockResolvedValue([]);
    const viewer = await mountPage();
    await flushPromises();
    expect(viewer.text()).toContain('Ask an admin to create one.');
    expect(viewer.findAll('button').filter((b) => b.text() === 'New flag')).toHaveLength(0);
  });

  it('searches after typing stops and when archived flags are shown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    session.request.mockResolvedValue([flag('a')]);
    const wrapper = await mountPage();
    await flushPromises();
    session.request.mockClear();
    session.request.mockResolvedValue([]);

    await wrapper.get('#flag-search').setValue('check');
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(session.request).toHaveBeenLastCalledWith(URL, {
      query: { search: 'check', includeArchived: undefined },
    });
    expect(wrapper.text()).toContain('No flag matches');

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(session.request).toHaveBeenLastCalledWith(URL, {
      query: { search: 'check', includeArchived: true },
    });
  });

  it('creates a flag and opens it', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click');
    await wrapper.get('#flag-name').setValue('Dark mode');
    session.request.mockClear();
    session.request.mockResolvedValueOnce(flag('dark-mode'));

    await wrapper.get('form[aria-labelledby="new-flag-title"]').trigger('submit');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith(URL, {
      method: 'POST',
      body: {
        key: 'dark-mode',
        name: 'Dark mode',
        description: '',
        type: 'boolean',
        clientVisible: false,
      },
    });
    expect(holder.navigateTo).toHaveBeenCalledWith('/projects/demo/flags/dark-mode');
  });

  it('keeps the form open and explains a duplicate key', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New flag')!
      .trigger('click');
    await wrapper.get('#flag-name').setValue('Dark mode');
    session.request.mockRejectedValueOnce(new ApiError(409, 'exists'));

    await wrapper.get('form[aria-labelledby="new-flag-title"]').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('A flag with this key already exists in the project.');
    expect(holder.navigateTo).not.toHaveBeenCalled();
  });
});
