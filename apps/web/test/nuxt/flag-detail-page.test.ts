import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import type { FlagView } from '../../app/utils/api-types';
import { environment } from '../unit/flag-editor.test';
import { createFakeEvents } from './helpers/fake-events';
import type { FakeEvents } from './helpers/fake-events';
import { createFakeSession } from './helpers/fake-session';
import type { FakeSession } from './helpers/fake-session';

const holder = vi.hoisted(() => ({ session: undefined as unknown, events: undefined as unknown }));
vi.mock('~/composables/useSession', () => ({ useSession: () => holder.session }));
vi.mock('~/composables/useProjectEvents', () => ({
  useProjectEvents: (...args: unknown[]) =>
    (holder.events as { useProjectEvents: (...a: unknown[]) => unknown }).useProjectEvents(...args),
}));

import FlagPage from '../../app/pages/projects/[project]/flags/[flag].vue';

const flagView = (overrides: Partial<FlagView> = {}): FlagView => ({
  key: 'new-checkout',
  name: 'New checkout',
  description: 'Redesigned checkout',
  type: 'boolean',
  onValue: true,
  offValue: false,
  clientVisible: true,
  archivedAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  environments: [
    environment({ environment: 'dev', enabled: true, rolloutPercentage: 25 }),
    environment({ environment: 'staging' }),
    environment({ environment: 'prod', killSwitch: true, killReason: 'Incident' }),
  ],
  ...overrides,
});

let session: FakeSession;
let events: FakeEvents;
const mountPage = () => mountSuspended(FlagPage, { route: '/projects/demo/flags/new-checkout' });

beforeEach(() => {
  session = createFakeSession('admin');
  holder.session = session;
  events = createFakeEvents();
  holder.events = events;
});

describe('flag settings on the detail page', () => {
  it('lets an admin change the details and shows the result', async () => {
    session.request.mockResolvedValueOnce(flagView());
    const wrapper = await mountPage();
    await flushPromises();
    session.request.mockClear();
    session.request
      .mockResolvedValueOnce(flagView({ name: 'Checkout v2' }))
      .mockResolvedValueOnce(flagView({ name: 'Checkout v2' }));

    await wrapper.get('#settings-name').setValue('Checkout v2');
    await wrapper.get('form[aria-label="Flag settings"]').trigger('submit');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith('/api/v1/projects/demo/flags/new-checkout', {
      method: 'PATCH',
      body: { name: 'Checkout v2' },
    });
    expect(wrapper.get('h2').text()).toBe('Checkout v2');
  });

  it('asks before archiving, then archives and shows the flag read-only', async () => {
    session.request.mockResolvedValueOnce(flagView());
    const wrapper = await mountPage();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archive flag…')!
      .trigger('click');
    const dialog = wrapper
      .findAll('dialog')
      .find((d) => d.text().includes('Archive “New checkout”?'))!;
    expect(dialog.attributes('open')).toBeDefined();
    session.request.mockClear();
    session.request
      .mockResolvedValueOnce(flagView({ archivedAt: '2026-10-09T10:00:00.000Z' }))
      .mockResolvedValueOnce(flagView({ archivedAt: '2026-10-09T10:00:00.000Z' }));
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Archive flag')!
      .trigger('click');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith('/api/v1/projects/demo/flags/new-checkout', {
      method: 'PATCH',
      body: { archived: true },
    });
    expect(wrapper.text()).toContain('This flag is archived');
    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
    expect(dialog.attributes('open')).toBeUndefined();
  });

  it('restores an archived flag', async () => {
    session.request.mockResolvedValueOnce(flagView({ archivedAt: '2026-10-09T10:00:00.000Z' }));
    const wrapper = await mountPage();
    await flushPromises();
    session.request.mockClear();
    session.request.mockResolvedValueOnce(flagView()).mockResolvedValueOnce(flagView());

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Restore flag')!
      .trigger('click');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith('/api/v1/projects/demo/flags/new-checkout', {
      method: 'PATCH',
      body: { archived: false },
    });
    expect(wrapper.text()).not.toContain('This flag is archived');
  });

  it('shows a problem from the server and keeps the dialog open', async () => {
    session.request.mockResolvedValueOnce(flagView());
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Archive flag…')!
      .trigger('click');
    session.request.mockRejectedValueOnce(
      new ApiError(409, 'The flag is archived; restore it first'),
    );

    const dialog = wrapper
      .findAll('dialog')
      .find((d) => d.text().includes('Archive “New checkout”?'))!;
    await dialog
      .findAll('button')
      .find((b) => b.text() === 'Archive flag')!
      .trigger('click');
    await flushPromises();

    expect(dialog.attributes('open')).toBeDefined();
    expect(dialog.get('[role="alert"]').text()).toContain('restore it first');
  });

  it('is not shown to a viewer', async () => {
    session = createFakeSession('viewer');
    holder.session = session;
    session.request.mockResolvedValue(flagView());
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.text()).not.toContain('Flag settings');
  });
});

describe('flag detail page', () => {
  it('shows the flag, a tab per environment with its status, and the dev panel first', async () => {
    session.request.mockResolvedValue(flagView());
    const wrapper = await mountPage();
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith('/api/v1/projects/demo/flags/new-checkout');
    expect(wrapper.get('h2').text()).toBe('New checkout');
    expect(wrapper.text()).toContain('Redesigned checkout');
    expect(wrapper.text()).toContain('client-visible');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual([
      'dev: On · 25%',
      'staging: Off',
      'prod: Kill switch',
    ]);
    expect(wrapper.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(
      'environment-tab-dev',
    );
  });

  it('shows another environment when its tab is chosen', async () => {
    session.request.mockResolvedValue(flagView());
    const wrapper = await mountPage();
    await flushPromises();

    await wrapper.findAll('[role="tab"]')[2]!.trigger('click');

    expect(wrapper.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(
      'environment-tab-prod',
    );
    expect(wrapper.get('#kill-title').text()).toBe('Kill switch is on in prod');
  });

  it('keeps an environment edit when switching tabs and back, and updates the tab status', async () => {
    session.request.mockResolvedValueOnce(flagView());
    const wrapper = await mountPage();
    await flushPromises();
    session.request.mockResolvedValueOnce(
      environment({ environment: 'dev', enabled: false, rolloutPercentage: 25, revision: 2 }),
    );

    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();

    expect(session.request).toHaveBeenLastCalledWith(
      '/api/v1/projects/demo/flags/new-checkout/environments/dev',
      {
        method: 'PATCH',
        body: { revision: 1, enabled: false },
      },
    );
    expect(wrapper.findAll('[role="tab"]')[0]!.text()).toBe('dev: Off');
  });

  it('is read-only for a viewer', async () => {
    session = createFakeSession('viewer');
    holder.session = session;
    session.request.mockResolvedValue(flagView());
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('only admins can change it');
  });

  it('is read-only for an archived flag, even for an admin', async () => {
    session.request.mockResolvedValue(flagView({ archivedAt: '2026-10-05T10:00:00.000Z' }));
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('This flag is archived');
  });

  it('shows loading, then an error with retry', async () => {
    session.request.mockRejectedValueOnce(new ApiError(404, 'Flag not found'));
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Flag not found');

    session.request.mockResolvedValue(flagView());
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.get('h2').text()).toBe('New checkout');
  });

  describe('live updates', () => {
    const withRevision = (
      revision: number,
      overrides: Partial<FlagView['environments'][number]> = {},
    ) =>
      flagView({
        environments: [
          environment({
            environment: 'dev',
            enabled: true,
            rolloutPercentage: 25,
            revision,
            ...overrides,
          }),
          environment({ environment: 'staging' }),
          environment({ environment: 'prod', killSwitch: true, killReason: 'Incident' }),
        ],
      });

    it('shows the connection state', async () => {
      session.request.mockResolvedValue(flagView());
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.get('[data-status]').attributes('data-status')).toBe('live');
      expect(wrapper.get('[data-status]').text()).toContain('Live');
    });

    it('quietly shows a change from someone else when there is nothing unsaved', async () => {
      session.request.mockResolvedValueOnce(flagView());
      const wrapper = await mountPage();
      await flushPromises();
      session.request.mockClear();
      session.request.mockResolvedValueOnce(withRevision(2, { rolloutPercentage: 80 }));

      events.push({ environmentKey: 'dev', revision: 2 });
      await flushPromises();

      expect(session.request).toHaveBeenCalledWith('/api/v1/projects/demo/flags/new-checkout');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.findAll('[role="tab"]')[0]!.text()).toBe('dev: On · 80%');
      expect((wrapper.get('input[id$="-number"]').element as HTMLInputElement).value).toBe('80');
    });

    it('warns instead of overwriting when there are unsaved edits', async () => {
      session.request.mockResolvedValueOnce(flagView());
      const wrapper = await mountPage();
      await flushPromises();
      await wrapper.get('input[type="range"]').setValue(60); // an unsaved edit
      session.request.mockResolvedValueOnce(withRevision(2, { rolloutPercentage: 80 }));
      session.request.mockResolvedValue({
        items: [
          {
            environmentKey: 'dev',
            actorEmail: 'maria@example.com',
            createdAt: '2026-10-09T10:35:00.000Z',
          },
        ],
        nextCursor: null,
      });

      events.push({ environmentKey: 'dev', revision: 2 });
      await flushPromises();

      const banner = wrapper.get('[role="alert"]');
      expect(banner.text()).toContain('maria@example.com made a change');
      expect(banner.text()).toContain('You both changed Rollout');
      expect((wrapper.get('input[id$="-number"]').element as HTMLInputElement).value).toBe('60'); // kept
    });

    it('ignores the echo of its own change (the revision is already known)', async () => {
      session.request.mockResolvedValueOnce(flagView());
      await mountPage();
      await flushPromises();
      session.request.mockClear();

      events.push({ environmentKey: 'dev', revision: 1 });
      await flushPromises();

      expect(session.request).not.toHaveBeenCalled();
    });

    it('ignores changes to other flags', async () => {
      session.request.mockResolvedValueOnce(flagView());
      await mountPage();
      await flushPromises();
      session.request.mockClear();

      events.push({ flagKey: 'something-else', environmentKey: 'dev', revision: 9 });
      await flushPromises();

      expect(session.request).not.toHaveBeenCalled();
    });

    it('reloads for a change that touches every environment, such as a rename', async () => {
      session.request.mockResolvedValueOnce(flagView());
      const wrapper = await mountPage();
      await flushPromises();
      session.request.mockClear();
      session.request.mockResolvedValueOnce(flagView({ name: 'Renamed checkout' }));

      events.push({ environmentKey: null, revision: null });
      await flushPromises();

      expect(wrapper.get('h2').text()).toBe('Renamed checkout');
    });

    it('reloads when the connection comes back, because events may have been missed', async () => {
      session.request.mockResolvedValueOnce(flagView());
      await mountPage();
      await flushPromises();
      session.request.mockClear();
      session.request.mockResolvedValueOnce(flagView());

      events.reconnect();
      await flushPromises();

      expect(session.request).toHaveBeenCalledTimes(1);
    });
  });
});
