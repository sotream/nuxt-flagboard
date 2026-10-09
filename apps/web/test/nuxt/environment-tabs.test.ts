import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import EnvironmentTabs from '../../app/components/EnvironmentTabs.vue';
import { panelId, tabId } from '../../app/utils/environment-ids';

const environments = [
  { key: 'dev', status: 'On' },
  { key: 'staging', status: 'Off' },
  { key: 'prod', status: 'Kill switch' },
];
const mountTabs = (modelValue = 'dev') =>
  mountSuspended(EnvironmentTabs, { props: { environments, modelValue }, attachTo: document.body });

describe('EnvironmentTabs', () => {
  it('is a tablist whose tabs point at their panels, and only the selected tab is in the tab order', async () => {
    const wrapper = await mountTabs('staging');

    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Environments');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((t) => t.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(tabs.map((t) => t.attributes('id'))).toEqual(environments.map((e) => tabId(e.key)));
    expect(tabs.map((t) => t.attributes('aria-controls'))).toEqual(
      environments.map((e) => panelId(e.key)),
    );
    expect(tabs[2]!.text()).toContain('Kill switch');
  });

  it('selects a tab when it is clicked', async () => {
    const wrapper = await mountTabs();
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['staging']]);
  });

  it.each([
    ['ArrowRight', 'dev', 'staging'],
    ['ArrowRight', 'prod', 'dev'], // wraps around
    ['ArrowLeft', 'staging', 'dev'],
    ['ArrowLeft', 'dev', 'prod'], // wraps around
    ['Home', 'prod', 'dev'],
    ['End', 'dev', 'prod'],
  ])('%s from %s selects %s and moves focus there', async (key, from, to) => {
    const wrapper = await mountTabs(from);
    const tabs = wrapper.findAll('[role="tab"]');
    const index = environments.findIndex((e) => e.key === from);

    await tabs[index]!.trigger('keydown', { key });

    expect(wrapper.emitted('update:modelValue')).toEqual([[to]]);
    expect(document.activeElement).toBe(tabs[environments.findIndex((e) => e.key === to)]!.element);
  });

  it('ignores other keys', async () => {
    const wrapper = await mountTabs();
    await wrapper.findAll('[role="tab"]')[0]!.trigger('keydown', { key: 'a' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
