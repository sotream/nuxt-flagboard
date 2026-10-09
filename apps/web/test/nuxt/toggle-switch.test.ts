import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ToggleSwitch from '../../app/components/ToggleSwitch.vue';

const mountSwitch = (props: Record<string, unknown> = {}) =>
  mountSuspended(ToggleSwitch, { props: { modelValue: false, label: 'Enabled in dev', ...props } });

describe('ToggleSwitch', () => {
  it('is a switch named by its visible label, with its state exposed', async () => {
    const off = await mountSwitch();
    const button = off.get('[role="switch"]');
    expect(button.attributes('aria-checked')).toBe('false');
    const labelId = button.attributes('aria-labelledby')!;
    expect(off.get(`#${labelId}`).text()).toBe('Enabled in dev');

    const on = await mountSwitch({ modelValue: true });
    expect(on.get('[role="switch"]').attributes('aria-checked')).toBe('true');
  });

  it('asks for the opposite value when pressed', async () => {
    const wrapper = await mountSwitch({ modelValue: false });
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
  });

  it('does nothing when disabled', async () => {
    const wrapper = await mountSwitch({ disabled: true });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('says it is saving while busy and points to its explanation', async () => {
    const wrapper = await mountSwitch({ busy: true, describedby: 'hint' });
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true');
    expect(wrapper.get('button').attributes('aria-describedby')).toBe('hint');
    expect(wrapper.text()).toContain('Saving…');
  });
});
