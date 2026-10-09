import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import AppIcon from '../../app/components/AppIcon.vue';

describe('AppIcon', () => {
  it('is hidden from assistive technology by default', async () => {
    const wrapper = await mountSuspended(AppIcon, { props: { name: 'flag' } });
    const svg = wrapper.get('svg');
    expect(svg.attributes('aria-hidden')).toBe('true');
    expect(svg.attributes('role')).toBeUndefined();
    expect(svg.attributes('viewBox')).toBe('0 0 16 16');
  });

  it('has a name for assistive technology when it carries meaning', async () => {
    const wrapper = await mountSuspended(AppIcon, {
      props: { name: 'eye', label: 'Visible to client keys' },
    });
    const svg = wrapper.get('svg');
    expect(svg.attributes('role')).toBe('img');
    expect(svg.attributes('aria-label')).toBe('Visible to client keys');
    expect(svg.attributes('aria-hidden')).toBeUndefined();
  });

  it('draws with the text colour and takes its size from the prop', async () => {
    const wrapper = await mountSuspended(AppIcon, { props: { name: 'plus', size: 12 } });
    const svg = wrapper.get('svg');
    expect(svg.attributes('width')).toBe('12');
    expect(svg.attributes('height')).toBe('12');
    expect(svg.attributes('stroke')).toBe('currentColor');
    expect(svg.classes()).toContain('icon');
  });

  it('draws the paths of the named icon', async () => {
    const wrapper = await mountSuspended(AppIcon, { props: { name: 'check' } });
    expect(wrapper.get('svg').html()).toContain('M3.5 8.5l3 3 6-7');
  });
});
