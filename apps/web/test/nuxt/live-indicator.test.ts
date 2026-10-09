import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import LiveIndicator from '../../app/components/LiveIndicator.vue';

describe('LiveIndicator', () => {
  it.each([
    ['connecting', 'Connecting…'],
    ['live', 'Live'],
    ['reconnecting', 'Reconnecting…'],
    ['offline', 'Live updates unavailable'],
  ] as const)('says %s in words, not only in colour', async (status, text) => {
    const wrapper = await mountSuspended(LiveIndicator, { props: { status } });
    expect(wrapper.text()).toContain(text);
    expect(wrapper.text()).toContain('Live updates:');
    expect(wrapper.get('[data-status]').attributes('data-status')).toBe(status);
  });
});
