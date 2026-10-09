import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import BrandMark from '../../app/components/BrandMark.vue';

describe('BrandMark', () => {
  it('is decorative: the word next to it names the product', async () => {
    const wrapper = await mountSuspended(BrandMark);
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true');
  });

  it('draws the pole in the text colour and the rollout part in the accent', async () => {
    const wrapper = await mountSuspended(BrandMark);
    const html = wrapper.html();
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('fill="var(--accent)"');
  });

  it('is 20 px by default and takes its size from the prop', async () => {
    expect((await mountSuspended(BrandMark)).get('svg').attributes('width')).toBe('20');
    expect(
      (await mountSuspended(BrandMark, { props: { size: 32 } })).get('svg').attributes('width'),
    ).toBe('32');
  });
});
