import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../app/utils/api-error';
import { createFakeSession } from './helpers/fake-session';
import type { FakeSession } from './helpers/fake-session';

const holder = vi.hoisted(() => ({ session: undefined as unknown }));
vi.mock('~/composables/useSession', () => ({ useSession: () => holder.session }));

import ProjectsPage from '../../app/pages/index.vue';

const project = (key: string, name = key) => ({
  id: key,
  key,
  name,
  createdAt: '2026-10-01T10:00:00.000Z',
  environments: [],
});

let session: FakeSession;
const mountPage = () => mountSuspended(ProjectsPage);

beforeEach(() => {
  session = createFakeSession('admin');
  holder.session = session;
});
afterEach(() => vi.useRealTimers());

describe('projects page', () => {
  it('lists projects as links', async () => {
    session.request.mockResolvedValue([project('demo', 'Demo project'), project('billing')]);
    const wrapper = await mountPage();
    await flushPromises();

    const links = wrapper.findAll('ul a');
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/projects/demo',
      '/projects/billing',
    ]);
    expect(links[0]!.text()).toContain('Demo project');
    expect(session.request).toHaveBeenCalledWith('/api/v1/projects', { query: { search: '' } });
  });

  it('shows a loading state first', async () => {
    session.request.mockReturnValue(new Promise(() => undefined));
    const wrapper = await mountPage();
    expect(wrapper.get('[role="status"]').text()).toContain('Loading projects');
  });

  it('shows an empty state with a create button for an admin', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('No projects yet');
    expect(wrapper.text()).toContain('Create the first project');
    expect(
      wrapper.findAll('button').filter((b) => b.text() === 'New project').length,
    ).toBeGreaterThan(0);
  });

  it('tells a viewer to ask an admin, and offers no create button', async () => {
    session = createFakeSession('viewer');
    holder.session = session;
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Ask an admin to create one.');
    expect(wrapper.findAll('button').filter((b) => b.text() === 'New project')).toHaveLength(0);
  });

  it('shows an error with a retry that loads again', async () => {
    session.request.mockRejectedValueOnce(new ApiError(0, 'Could not reach the server'));
    const wrapper = await mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach the server');

    session.request.mockResolvedValue([project('demo')]);
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('ul a')).toHaveLength(1);
  });

  it('searches after the person stops typing, and shows a search-specific empty state', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    session.request.mockResolvedValue([project('demo')]);
    const wrapper = await mountPage();
    await flushPromises();
    session.request.mockClear();
    session.request.mockResolvedValue([]);

    await wrapper.get('#project-search').setValue('pay');
    vi.advanceTimersByTime(249);
    expect(session.request).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith('/api/v1/projects', { query: { search: 'pay' } });
    expect(wrapper.text()).toContain('No project matches your search');
  });

  it('creates a project, closes the form and reloads the list', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New project')!
      .trigger('click');
    await wrapper.get('#project-name').setValue('Billing');
    session.request.mockClear();
    session.request
      .mockResolvedValueOnce(project('billing', 'Billing'))
      .mockResolvedValue([project('billing', 'Billing')]);
    await wrapper.get('form[aria-labelledby="new-project-title"]').trigger('submit');
    await flushPromises();

    expect(session.request).toHaveBeenCalledWith('/api/v1/projects', {
      method: 'POST',
      body: { key: 'billing', name: 'Billing' },
    });
    expect(wrapper.find('#new-project-title').exists()).toBe(false);
    expect(wrapper.findAll('ul a')).toHaveLength(1);
  });

  it('keeps the form open and explains a duplicate key', async () => {
    session.request.mockResolvedValue([]);
    const wrapper = await mountPage();
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'New project')!
      .trigger('click');
    await wrapper.get('#project-name').setValue('Billing');
    session.request.mockRejectedValueOnce(
      new ApiError(409, 'A project with this key already exists'),
    );

    await wrapper.get('form[aria-labelledby="new-project-title"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('#new-project-title').exists()).toBe(true);
    expect(wrapper.text()).toContain('A project with this key already exists. Choose another key.');
  });
});
