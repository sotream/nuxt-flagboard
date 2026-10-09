import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ResourceState from '../../app/components/ResourceState.vue';

const mountState = (props: Record<string, unknown>, slot = '<p>the content</p>') =>
  mountSuspended(ResourceState, {
    props: { label: 'projects', ...props } as never,
    slots: { default: slot },
  });

describe('ResourceState', () => {
  it('announces loading to screen readers and shows a skeleton while there is no data yet', async () => {
    const wrapper = await mountState({ status: 'loading', hasData: false });

    const status = wrapper.get('[role="status"]');
    expect(status.attributes('aria-busy')).toBe('true');
    expect(status.text()).toContain('Loading projects…');
    expect(wrapper.text()).not.toContain('the content');
  });

  it('shows the content once data has arrived', async () => {
    const wrapper = await mountState({ status: 'success', hasData: true });
    expect(wrapper.text()).toContain('the content');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('keeps showing the old content, marked busy, while it reloads', async () => {
    const wrapper = await mountState({ status: 'loading', hasData: true });
    expect(wrapper.text()).toContain('the content');
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('shows the empty message, with a hint and the action', async () => {
    const wrapper = await mountSuspended(ResourceState, {
      props: {
        status: 'success',
        hasData: true,
        empty: true,
        emptyTitle: 'No projects yet',
        emptyHint: 'Create the first one.',
      },
      slots: { default: '<p>the content</p>', 'empty-action': '<button>Create</button>' },
    });

    expect(wrapper.text()).toContain('No projects yet');
    expect(wrapper.text()).toContain('Create the first one.');
    expect(wrapper.get('button').text()).toBe('Create');
    expect(wrapper.text()).not.toContain('the content');
  });

  it('shows an error as an alert with a retry button that asks the parent to reload', async () => {
    const wrapper = await mountState({
      status: 'error',
      hasData: false,
      error: 'Could not reach the server',
    });

    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Could not load projects');
    expect(alert.text()).toContain('Could not reach the server');
    await alert.get('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });

  it('shows the error above the old content when a reload fails', async () => {
    const wrapper = await mountState({ status: 'error', hasData: true, error: 'down' });
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('the content');
  });
});
