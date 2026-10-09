import { flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import RuleEditor from '../../app/components/RuleEditor.vue';
import type { Rule } from '../../app/utils/api-types';

const ua: Rule = {
  serve: 'on',
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
};
const pro: Rule = {
  serve: 'off',
  conditions: [{ attribute: 'plan', operator: 'in', values: ['pro', 'team'] }],
};

/** Mounts the editor wired like `v-model`: what it emits becomes its new value. */
async function mountEditor(rules: Rule[] = [], props: Record<string, unknown> = {}) {
  const updates: Rule[][] = [];
  const invalid: boolean[] = [];
  const holder: { wrapper?: VueWrapper } = {};
  const wrapper = (await mountSuspended(RuleEditor, {
    props: {
      modelValue: rules,
      onLabel: 'true',
      offLabel: 'false',
      'onUpdate:modelValue': (value: Rule[]) => {
        updates.push(value);
        void holder.wrapper?.setProps({ modelValue: value });
      },
      onInvalid: (value: boolean) => invalid.push(value),
      ...props,
    },
    attachTo: document.body,
  })) as VueWrapper;
  holder.wrapper = wrapper;
  return { wrapper, updates, invalid };
}
const button = (wrapper: VueWrapper, label: string) =>
  wrapper
    .findAll('button')
    .find((b) => b.text() === label || b.attributes('aria-label') === label)!;
const inputs = (wrapper: VueWrapper, label: string) => wrapper.findAll(`input[id$="-${label}"]`);

describe('RuleEditor', () => {
  it('shows an empty state and how rules work', async () => {
    const { wrapper } = await mountEditor([]);
    expect(wrapper.text()).toContain('No rules. Everyone is handled by the rollout above.');
    expect(wrapper.text()).toContain('first rule whose conditions all match decides');
  });

  it('shows existing rules with their conditions, in order, with labelled fields', async () => {
    const { wrapper } = await mountEditor([ua, pro]);

    expect(wrapper.findAll('legend').map((l) => l.text())).toEqual(['Rule 1', 'Rule 2']);
    expect((inputs(wrapper, 'attribute')[0]!.element as HTMLInputElement).value).toBe('country');
    expect((inputs(wrapper, 'value')[1]!.element as HTMLInputElement).value).toBe('pro, team');
    expect(wrapper.findAll('label').some((l) => l.text() === 'Attribute')).toBe(true);
    expect(
      wrapper.findAll('select[id$="-serve"]').map((s) => (s.element as HTMLSelectElement).value),
    ).toEqual(['on', 'off']);
    expect(wrapper.text()).toContain('on (true)');
  });

  it('adds a rule that is not valid until it is filled in, and reports that', async () => {
    const { wrapper, updates, invalid } = await mountEditor([]);

    await button(wrapper, 'Add rule').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('legend')).toHaveLength(1);
    expect(wrapper.text()).toContain('Enter an attribute name.');
    expect(wrapper.text()).toContain('Enter a value.');
    expect(updates).toEqual([]); // nothing valid to send yet
    expect(invalid.at(-1)).toBe(true);
    expect(wrapper.get('[role="status"]').text()).toBe('Rule 1 added.');
  });

  it('emits the rule once it is filled in, and reports that it is valid', async () => {
    const { wrapper, updates, invalid } = await mountEditor([]);
    await button(wrapper, 'Add rule').trigger('click');

    await inputs(wrapper, 'attribute')[0]!.setValue('country');
    await inputs(wrapper, 'value')[0]!.setValue('UA');
    await flushPromises();

    expect(updates.at(-1)).toEqual([ua]);
    expect(invalid.at(-1)).toBe(false);
    expect(wrapper.text()).not.toContain('Enter an attribute name.');
  });

  it('keeps value types strict: a number type sends 1, a text type sends "1"', async () => {
    const { wrapper, updates } = await mountEditor([
      { serve: 'on', conditions: [{ attribute: 'tier', operator: 'equals', value: '1' }] },
    ]);

    await wrapper.get('select[id$="-type"]').setValue('number');
    await flushPromises();
    expect(updates.at(-1)![0]!.conditions[0]).toMatchObject({ value: 1 });

    await wrapper.get('select[id$="-type"]').setValue('text');
    await flushPromises();
    expect(updates.at(-1)![0]!.conditions[0]).toMatchObject({ value: '1' });
  });

  it('turns an "is one of" list into values', async () => {
    const { wrapper, updates } = await mountEditor([ua]);

    await wrapper.get('select[id$="-operator"]').setValue('in');
    await inputs(wrapper, 'value')[0]!.setValue('UA, PL');
    await flushPromises();

    expect(updates.at(-1)![0]!.conditions[0]).toEqual({
      attribute: 'country',
      operator: 'in',
      values: ['UA', 'PL'],
    });
  });

  it('shows what is wrong with a number that is not one', async () => {
    const { wrapper, updates } = await mountEditor([ua]);
    const before = updates.length;

    await wrapper.get('select[id$="-type"]').setValue('number');
    await flushPromises();

    expect(wrapper.text()).toContain('"UA" is not a number.');
    expect(updates.length).toBe(before); // the invalid state is not sent
    expect(wrapper.get('input[id$="-value"]').attributes('aria-invalid')).toBe('true');
    expect(wrapper.get('input[id$="-value"]').attributes('aria-describedby')).toContain(
      'value-error',
    );
  });

  it('changes what a rule serves', async () => {
    const { wrapper, updates } = await mountEditor([ua]);
    await wrapper.get('select[id$="-serve"]').setValue('off');
    await flushPromises();
    expect(updates.at(-1)).toEqual([{ ...ua, serve: 'off' }]);
  });

  describe('order', () => {
    it('moves a rule down and up, announcing the new position', async () => {
      const { wrapper, updates } = await mountEditor([ua, pro]);

      await button(wrapper, 'Move rule 1 down').trigger('click');
      await flushPromises();
      expect(updates.at(-1)).toEqual([pro, ua]);
      expect(wrapper.get('[role="status"]').text()).toBe('Rule moved to position 2 of 2.');

      await button(wrapper, 'Move rule 2 up').trigger('click');
      await flushPromises();
      expect(updates.at(-1)).toEqual([ua, pro]);
    });

    it('cannot move the first rule up or the last rule down', async () => {
      const { wrapper } = await mountEditor([ua, pro]);
      expect(button(wrapper, 'Move rule 1 up').attributes('disabled')).toBeDefined();
      expect(button(wrapper, 'Move rule 2 down').attributes('disabled')).toBeDefined();
      expect(button(wrapper, 'Move rule 1 down').attributes('disabled')).toBeUndefined();
    });
  });

  it('removes a rule and says how many are left', async () => {
    const { wrapper, updates } = await mountEditor([ua, pro]);

    await button(wrapper, 'Remove rule 1').trigger('click');
    await flushPromises();

    expect(updates.at(-1)).toEqual([pro]);
    expect(wrapper.get('[role="status"]').text()).toBe('Rule 1 removed. 1 rule left.');
  });

  it('removes the last rule and shows the empty state', async () => {
    const { wrapper, updates } = await mountEditor([ua]);
    await button(wrapper, 'Remove rule 1').trigger('click');
    await flushPromises();
    expect(updates.at(-1)).toEqual([]);
    expect(wrapper.text()).toContain('No rules.');
  });

  it('adds and removes conditions, keeping at least one in a rule', async () => {
    const { wrapper, updates } = await mountEditor([ua]);
    expect(button(wrapper, 'Remove condition 1 of rule 1').attributes('disabled')).toBeDefined();

    await button(wrapper, 'Add condition').trigger('click');
    await inputs(wrapper, 'attribute')[1]!.setValue('plan');
    await inputs(wrapper, 'value')[1]!.setValue('pro');
    await flushPromises();
    expect(updates.at(-1)![0]!.conditions).toHaveLength(2);
    expect(wrapper.text()).toContain('and');

    await button(wrapper, 'Remove condition 1 of rule 1').trigger('click');
    await flushPromises();
    expect(updates.at(-1)![0]!.conditions).toEqual([
      { attribute: 'plan', operator: 'equals', value: 'pro' },
    ]);
  });

  it('follows rules that change from outside (discard, load latest) and forgets half-typed problems', async () => {
    const { wrapper, invalid } = await mountEditor([ua]);
    await button(wrapper, 'Add rule').trigger('click');
    await flushPromises();
    expect(invalid.at(-1)).toBe(true);

    await wrapper.setProps({ modelValue: [pro] }); // for example "Load latest"
    await flushPromises();

    expect(wrapper.findAll('legend')).toHaveLength(1);
    expect((inputs(wrapper, 'attribute')[0]!.element as HTMLInputElement).value).toBe('plan');
    expect(invalid.at(-1)).toBe(false);
    expect(wrapper.text()).not.toContain('Enter an attribute name.');
  });

  it('is read-only when disabled: no buttons, fields disabled', async () => {
    const { wrapper } = await mountEditor([ua], { disabled: true });
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  });

  it('stops offering new rules at 20', async () => {
    const twenty = Array.from({ length: 20 }, () => ua);
    const { wrapper } = await mountEditor(twenty);
    expect(button(wrapper, 'Add rule').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('at most 20 rules');
  });
});
