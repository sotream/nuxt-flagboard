import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import RolloutSlider from '../../app/components/RolloutSlider.vue';

const mountSlider = (props: Record<string, unknown> = {}) =>
  mountSuspended(RolloutSlider, { props: { modelValue: 25, ...props }, attachTo: document.body });

const number = (wrapper: Awaited<ReturnType<typeof mountSlider>>) =>
  wrapper.get('input[type="text"]');
const range = (wrapper: Awaited<ReturnType<typeof mountSlider>>) =>
  wrapper.get('input[type="range"]');

describe('RolloutSlider', () => {
  it('shows the value in a slider and a number field, both labelled, with a spoken value', async () => {
    const wrapper = await mountSlider({ modelValue: 25 });

    expect((range(wrapper).element as HTMLInputElement).value).toBe('25');
    expect((number(wrapper).element as HTMLInputElement).value).toBe('25');
    expect(wrapper.get('label').text()).toBe('Rollout percentage');
    expect(range(wrapper).attributes('aria-valuetext')).toBe('25 percent');
    expect(range(wrapper).attributes('aria-label')).toBe('Rollout percentage slider');
  });

  it('emits the new value as the slider moves', async () => {
    const wrapper = await mountSlider();
    await range(wrapper).setValue(60);
    expect(wrapper.emitted('update:modelValue')).toEqual([[60]]);
  });

  it('emits whole numbers as they are typed, and waits while the text is not a number yet', async () => {
    const wrapper = await mountSlider();

    await number(wrapper).setValue('4');
    await number(wrapper).setValue('45');
    expect(wrapper.emitted('update:modelValue')).toEqual([[4], [45]]);

    // While typing only the `input` event fires; `change` comes when the field is left.
    (number(wrapper).element as HTMLInputElement).value = '4x';
    await number(wrapper).trigger('input');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2);
    expect(number(wrapper).attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('[role="alert"]').text()).toContain('whole number from 0 to 100');
  });

  it('pulls an out-of-range number to the nearest end when the field is left', async () => {
    const wrapper = await mountSlider();
    await number(wrapper).setValue('250');
    await number(wrapper).trigger('blur');

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100]);
    expect((number(wrapper).element as HTMLInputElement).value).toBe('100');

    await number(wrapper).setValue('-9');
    await number(wrapper).trigger('blur');
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([0]);
  });

  it('restores the last good value when the field is left with nonsense or empty', async () => {
    const wrapper = await mountSlider({ modelValue: 25 });
    await number(wrapper).setValue('abc');
    await number(wrapper).trigger('blur');

    expect((number(wrapper).element as HTMLInputElement).value).toBe('25');
    expect(number(wrapper).attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('follows the value when the parent changes it (for example after a reload)', async () => {
    const wrapper = await mountSlider({ modelValue: 25 });
    await wrapper.setProps({ modelValue: 70 });
    expect((number(wrapper).element as HTMLInputElement).value).toBe('70');
    expect((range(wrapper).element as HTMLInputElement).value).toBe('70');
  });

  it('explains what the percentage means, including the user id requirement', async () => {
    const hint = async (modelValue: number) =>
      (await mountSlider({ modelValue })).get('p:not([role])').text();

    expect(await hint(0)).toContain('Nobody');
    expect(await hint(100)).toContain('Everyone');
    expect(await hint(40)).toContain('needs a user id');
  });

  it('cannot be changed when disabled', async () => {
    const wrapper = await mountSlider({ disabled: true });
    expect(range(wrapper).attributes('disabled')).toBeDefined();
    expect(number(wrapper).attributes('disabled')).toBeDefined();
  });
});
