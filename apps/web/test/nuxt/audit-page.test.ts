import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import type { AuditEventView } from '../../app/utils/api-types';
import { createFakeSession } from './helpers/fake-session';
import type { FakeSession } from './helpers/fake-session';

const holder = vi.hoisted(() => ({ session: undefined as unknown }));
vi.mock('~/composables/useSession', () => ({ useSession: () => holder.session }));

import AuditPage from '../../app/pages/projects/[project]/audit.vue';

const event = (id: string, overrides: Partial<AuditEventView> = {}): AuditEventView => ({
  id,
  action: 'flag.environment.updated',
  actorId: 'u',
  actorEmail: 'admin@example.com',
  flagKey: 'new-checkout',
  environmentKey: 'dev',
  before: { enabled: false },
  after: { enabled: true },
  createdAt: '2026-10-09T10:00:00.000Z',
  ...overrides,
});
const flagList = [
  { key: 'new-checkout', name: 'New checkout' },
  { key: 'old-flag', name: 'Old flag' },
];

let session: FakeSession;
/** Answers the flag list and the audit requests, by URL. */
function serve(pages: { items: AuditEventView[]; nextCursor: string | null }[]) {
  let call = 0;
  session.request.mockImplementation(async (path: string) => {
    if (path.endsWith('/flags')) return flagList;
    return pages[Math.min(call++, pages.length - 1)];
  });
}
const auditCalls = () => session.request.mock.calls.filter((c) => String(c[0]).endsWith('/audit'));
const mountPage = () => mountSuspended(AuditPage, { route: '/projects/demo/audit' });

beforeEach(() => {
  session = createFakeSession('viewer'); // anyone signed in can read the audit log
  holder.session = session;
  // Only the clock is fixed, so "Today" does not depend on the day the test runs.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T10:01:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('audit page', () => {
  it('lists events newest first as plain sentences, grouped by day', async () => {
    serve([
      {
        items: [
          event('2', {
            action: 'flag.kill_switch.enabled',
            before: { killSwitch: false },
            after: { killSwitch: true, killReason: 'provider errors' },
          }),
          event('1'),
          event('0', { createdAt: '2026-10-08T09:00:00.000Z' }),
        ],
        nextCursor: null,
      },
    ]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['Today', 'Yesterday']);
    const rows = wrapper.findAll('ol li');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain(
      'Switched the kill switch on in dev. Reason: provider errors',
    );
    expect(rows[1]!.text()).toContain('Turned the flag on in dev');
    expect(rows[1]!.text()).toContain('admin@example.com');
    expect(rows[1]!.get('a').attributes('href')).toBe('/projects/demo/flags/new-checkout');
    expect(rows[1]!.get('time').attributes('datetime')).toBe('2026-10-09T10:00:00.000Z');
    expect(wrapper.text()).toContain('cannot be edited or deleted');
  });

  it('shows an event with an invalid timestamp under "Unknown date" instead of failing', async () => {
    serve([{ items: [event('1', { createdAt: 'not-a-date' }), event('2')], nextCursor: null }]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.findAll('h3').map((h) => h.text())).toEqual(['Unknown date', 'Today']);
    expect(wrapper.findAll('ol li')).toHaveLength(2);
  });

  it('keeps the time on one line, also for 12-hour clocks such as 10:42 PM', async () => {
    serve([{ items: [event('1')], nextCursor: null }]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.get('ol li time').classes()).toContain('whitespace-nowrap');
    expect(wrapper.get('ol li').classes().join(' ')).toContain('grid-cols-[4.5rem');
  });

  it('does not print field diffs or ids outside the raw data', async () => {
    serve([
      {
        items: [
          event('1', {
            action: 'api_key.created',
            flagKey: null,
            before: null,
            after: {
              id: 'c071ef22-aaaa',
              name: 'Local development',
              kind: 'client',
              prefix: 'fb_cli_ab',
            },
          }),
        ],
        nextCursor: null,
      },
    ]);
    const wrapper = await mountPage();
    await flushPromises();

    const row = wrapper.get('ol li');
    expect(row.text()).toContain('Created the client key “Local development” in dev');
    const visible = row.text().replace(row.get('details').text(), '');
    expect(visible).not.toContain('c071ef22');
    expect(visible).not.toMatch(/Id:|Kind:/);
    expect(row.get('details pre').text()).toContain('c071ef22-aaaa'); // still there, behind the toggle
  });

  it('gives several sentences for one event, in a fixed order', async () => {
    serve([
      {
        items: [
          event('1', {
            before: { rules: [], enabled: false, rolloutPercentage: 0 },
            after: { rules: [{}], enabled: true, rolloutPercentage: 25 },
          }),
        ],
        nextCursor: null,
      },
    ]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.findAll('ol li p').map((p) => p.text())).toEqual([
      'Turned the flag on in dev',
      'Raised rollout from 0% to 25% in dev',
      'Changed targeting rules in dev (0 rules to 1 rule)',
    ]);
  });

  it('shows a name that contains markup as text, never as HTML', async () => {
    const name = '<img src=x onerror=alert(1)>';
    serve([{ items: [event('1', { action: 'flag.created', after: { name } })], nextCursor: null }]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.find('ol li img').exists()).toBe(false);
    expect(wrapper.get('ol li').text()).toContain(`Created the flag “${name}”`);
    expect(wrapper.get('ol li').html()).toContain('&lt;img');
  });

  it('keeps a very long word inside its column', async () => {
    const word = 'W'.repeat(300);
    serve([
      { items: [event('1', { action: 'flag.created', after: { name: word } })], nextCursor: null },
    ]);
    const wrapper = await mountPage();
    await flushPromises();

    const sentence = wrapper.get('ol li p');
    expect(sentence.classes()).toContain('wrap-anywhere');
    expect(sentence.text().length).toBeLessThan(120); // shortened, with the whole name behind "Raw data"
    expect(wrapper.get('ol li details pre').text()).toContain(word); // the whole name stays in the raw data
  });

  it('shows the raw data of a change on request', async () => {
    serve([{ items: [event('1')], nextCursor: null }]);
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get('details pre').text()).toContain('"enabled": true');
  });

  it('shows loading, empty and error states', async () => {
    session.request.mockImplementation(async (path: string) =>
      path.endsWith('/flags') ? flagList : new Promise(() => undefined),
    );
    expect((await mountPage()).get('[role="status"]').text()).toContain('Loading the audit log');

    serve([{ items: [], nextCursor: null }]);
    const empty = await mountPage();
    await flushPromises();
    expect(empty.text()).toContain('Nothing has happened yet');

    session.request.mockImplementation(async (path: string) => {
      if (path.endsWith('/flags')) return flagList;
      throw new ApiError(500, 'The server failed');
    });
    const failed = await mountPage();
    await flushPromises();
    expect(failed.get('[role="alert"]').text()).toContain('The server failed');
  });

  it('filters by flag and starts again from the first page', async () => {
    serve([{ items: [event('1')], nextCursor: null }]);
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.findAll('#audit-flag option').map((o) => o.text())).toEqual([
      'All changes',
      'New checkout (new-checkout)',
      'Old flag (old-flag)',
    ]);

    serve([{ items: [event('9', { flagKey: 'old-flag' })], nextCursor: null }]);
    await wrapper.get('#audit-flag').setValue('old-flag');
    await flushPromises();

    expect(auditCalls().at(-1)![1]).toEqual({ query: { flagKey: 'old-flag', limit: 25 } });
    expect(wrapper.findAll('ol li')).toHaveLength(1);
  });

  it('loads more with the cursor and appends, until there is no more', async () => {
    serve([
      { items: [event('3'), event('2')], nextCursor: '2' },
      { items: [event('1')], nextCursor: null },
    ]);
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.findAll('ol li')).toHaveLength(2);

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Load more')!
      .trigger('click');
    await flushPromises();

    expect(auditCalls().at(-1)![1]).toEqual({
      query: { flagKey: undefined, limit: 25, cursor: '2' },
    });
    expect(wrapper.findAll('ol li')).toHaveLength(3);
    expect(wrapper.findAll('button').some((b) => b.text() === 'Load more')).toBe(false);
    expect(wrapper.text()).toContain('That is everything.');
  });

  it('keeps the events it has and says so when loading more fails', async () => {
    let call = 0;
    session.request.mockImplementation(async (path: string) => {
      if (path.endsWith('/flags')) return flagList;
      if (call++ === 0) return { items: [event('2')], nextCursor: '2' };
      throw new ApiError(500, 'Could not load more');
    });
    const wrapper = await mountPage();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Load more')!
      .trigger('click');
    await flushPromises();

    expect(wrapper.findAll('ol li')).toHaveLength(1);
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load more');
  });

  it('discards a "load more" answer that arrives after the filter changed', async () => {
    let release!: (page: unknown) => void;
    let call = 0;
    session.request.mockImplementation((path: string) => {
      if (path.endsWith('/flags')) return Promise.resolve(flagList);
      call += 1;
      if (call === 1) return Promise.resolve({ items: [event('2')], nextCursor: '2' });
      if (call === 2) return new Promise((resolve) => (release = resolve)); // the slow "load more"
      return Promise.resolve({ items: [event('9', { flagKey: 'old-flag' })], nextCursor: null });
    });
    const wrapper = await mountPage();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Load more')!
      .trigger('click');
    await wrapper.get('#audit-flag').setValue('old-flag');
    await flushPromises();
    release({ items: [event('1')], nextCursor: null });
    await flushPromises();

    expect(wrapper.findAll('ol li')).toHaveLength(1);
    expect(wrapper.get('ol li').text()).toContain('old-flag');
  });
});
