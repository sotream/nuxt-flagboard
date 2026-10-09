import { flushPromises } from '@vue/test-utils';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it, vi } from 'vitest';
import FlagEnvironmentPanel from '../../app/components/FlagEnvironmentPanel.vue';
import type { FlagEnvironmentView } from '../../app/utils/api-types';
import { createEnvEditor } from '../../app/utils/env-editor';
import type { SendEnvironmentRequest } from '../../app/utils/env-editor';
import { environment } from '../unit/flag-editor.test';

const flag = { name: 'New checkout', type: 'boolean' as const, onValue: true, offValue: false };

function setup(
  initial: FlagEnvironmentView = environment({ environment: 'prod' }),
  props: Record<string, unknown> = {},
) {
  let current = initial;
  const send = vi.fn<SendEnvironmentRequest>(async (_method, suffix, body) => {
    const { revision, reason, ...fields } = body as { revision: number; reason?: string } & Record<
      string,
      unknown
    >;
    current =
      suffix === '/kill-switch'
        ? { ...current, killSwitch: true, killReason: reason ?? null, revision: revision + 1 }
        : suffix === '/kill-switch/release'
          ? { ...current, killSwitch: false, killReason: null, revision: revision + 1 }
          : { ...current, ...fields, revision: revision + 1 };
    return current;
  });
  const editor = createEnvEditor(initial, send);
  const mount = () =>
    mountSuspended(FlagEnvironmentPanel, {
      props: { editor, flag, canEdit: true, ...props },
      attachTo: document.body,
    });
  return { editor, send, mount };
}

describe('FlagEnvironmentPanel', () => {
  it('is a tab panel for its environment, with a switch named after it', async () => {
    const { mount } = setup();
    const wrapper = await mount();

    const panel = wrapper.get('[role="tabpanel"]');
    expect(panel.attributes('aria-labelledby')).toBe('environment-tab-prod');
    expect(wrapper.get('[role="switch"]').text()).toBe('');
    expect(wrapper.text()).toContain('Enabled in prod');
  });

  it('saves the switch at once and shows the new revision', async () => {
    const { mount, send } = setup();
    const wrapper = await mount();

    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();

    expect(send).toHaveBeenCalledWith('PATCH', '', { revision: 1, enabled: true });
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    expect(wrapper.text()).toContain('revision 2');
  });

  it('explains what the switch serves, in the flag values', async () => {
    const { mount } = setup(undefined, {
      flag: { name: 'Colour', type: 'string', onValue: 'blue', offValue: 'red' },
    });
    const wrapper = await mount();
    expect(wrapper.get('#enabled-hint').text()).toContain('"blue"');
    expect(wrapper.get('#enabled-hint').text()).toContain('"red"');
  });

  it('shows an error when a save fails and puts the switch back', async () => {
    const { mount, send } = setup();
    send.mockRejectedValueOnce(Object.assign(new Error('x'), {}));
    const wrapper = await mount();

    await wrapper.get('[role="switch"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not save');
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false');
  });

  it('is read-only for someone who cannot edit, and says why', async () => {
    const { mount, send } = setup(undefined, {
      canEdit: false,
      readOnlyReason: 'You can view this flag, but only admins can change it.',
    });
    const wrapper = await mount();

    expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('#read-only-reason').text()).toContain('only admins');
    expect(wrapper.get('[role="switch"]').attributes('aria-describedby')).toBe('read-only-reason');
    expect(wrapper.findAll('button').filter((b) => b.text().includes('Kill switch'))).toHaveLength(
      0,
    );
    await wrapper.get('[role="switch"]').trigger('click');
    expect(send).not.toHaveBeenCalled();
  });

  describe('kill switch', () => {
    it('opens a dialog, requires a reason, then switches off and shows the state', async () => {
      const { mount, send } = setup(environment({ environment: 'prod', enabled: true }));
      const wrapper = await mount();

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Kill switch…')!
        .trigger('click');
      await wrapper.get('#kill-reason').setValue('Payments failing');
      await wrapper.get('dialog form').trigger('submit');
      await flushPromises();

      expect(send).toHaveBeenCalledWith('POST', '/kill-switch', {
        revision: 1,
        reason: 'Payments failing',
      });
      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
      expect(wrapper.get('#kill-title').text()).toBe('Kill switch is on in prod');
      expect(wrapper.text()).toContain('Reason: Payments failing');
      expect(wrapper.text()).toContain('serves false to everyone');
    });

    it('can be released', async () => {
      const { mount, send } = setup(
        environment({ environment: 'prod', killSwitch: true, killReason: 'x' }),
      );
      const wrapper = await mount();

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Release kill switch')!
        .trigger('click');
      await flushPromises();

      expect(send).toHaveBeenCalledWith('POST', '/kill-switch/release', { revision: 1 });
      expect(wrapper.find('#kill-title').exists()).toBe(false);
    });

    it('does not offer the dialog while the switch is already on', async () => {
      const { mount } = setup(
        environment({ environment: 'prod', killSwitch: true, killReason: 'x' }),
      );
      const wrapper = await mount();
      expect(wrapper.findAll('button').filter((b) => b.text() === 'Kill switch…')).toHaveLength(0);
    });
  });

  describe('unsaved changes', () => {
    it('appear when the draft differs, and Save sends only what changed', async () => {
      const { mount, send, editor } = setup();
      const wrapper = await mount();
      expect(wrapper.find('[aria-label="Unsaved changes"]').exists()).toBe(false);

      editor.state.draft.rolloutPercentage = 30;
      await flushPromises();
      const bar = wrapper.get('[aria-label="Unsaved changes"]');
      expect(bar.text()).toContain('Rollout');

      await bar
        .findAll('button')
        .find((b) => b.text() === 'Save changes')!
        .trigger('click');
      await flushPromises();
      expect(send).toHaveBeenCalledWith('PATCH', '', { revision: 1, rolloutPercentage: 30 });
      expect(wrapper.find('[aria-label="Unsaved changes"]').exists()).toBe(false);
    });

    it('come from the rollout slider, and the field shows the draft', async () => {
      const { mount, send } = setup();
      const wrapper = await mount();

      await wrapper.get('input[type="range"]').setValue(45);
      await flushPromises();

      expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('45');
      expect(wrapper.get('[aria-label="Unsaved changes"]').text()).toContain('Rollout');
      expect(send).not.toHaveBeenCalled(); // nothing is saved until Save is pressed
    });

    it('include rules: a valid rule is saved with the rest, and an unfinished one blocks Save', async () => {
      const { mount, send } = setup();
      const wrapper = await mount();

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Add rule')!
        .trigger('click');
      await flushPromises();
      const bar = () => wrapper.get('[aria-label="Unsaved changes"]');
      expect(bar().text()).toContain('Fix the highlighted rule fields to save.');
      expect(
        bar()
          .findAll('button')
          .find((b) => b.text() === 'Save changes')!
          .attributes('disabled'),
      ).toBeDefined();

      await wrapper.get('input[id$="-attribute"]').setValue('country');
      await wrapper.get('input[id$="-value"]').setValue('UA');
      await flushPromises();
      expect(bar().text()).toContain('Targeting rules');
      await bar()
        .findAll('button')
        .find((b) => b.text() === 'Save changes')!
        .trigger('click');
      await flushPromises();

      expect(send).toHaveBeenCalledWith('PATCH', '', {
        revision: 1,
        rules: [
          { serve: 'on', conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }] },
        ],
      });
    });

    it('can be discarded, which also clears an unfinished rule', async () => {
      const { mount, send } = setup();
      const wrapper = await mount();
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Add rule')!
        .trigger('click');
      await flushPromises();

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Discard')!
        .trigger('click');
      await flushPromises();

      expect(wrapper.find('legend').exists()).toBe(false);
      expect(wrapper.find('[aria-label="Unsaved changes"]').exists()).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it('can be discarded', async () => {
      const { mount, send, editor } = setup();
      const wrapper = await mount();
      editor.state.draft.rolloutPercentage = 30;
      await flushPromises();

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Discard')!
        .trigger('click');
      await flushPromises();

      expect(editor.state.draft.rolloutPercentage).toBe(0);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('when someone else changed the environment', () => {
    const lookup = vi.fn(async () => ({
      email: 'maria@example.com',
      at: '2026-10-09T10:35:00.000Z',
    }));

    /** The server moved on to revision 2 behind this person's back. */
    const elsewhere = (overrides: Partial<FlagEnvironmentView> = {}) =>
      environment({
        environment: 'prod',
        revision: 2,
        updatedAt: '2026-10-09T10:35:00.000Z',
        ...overrides,
      });

    it('shows a banner with the actor, keeps the draft, and freezes the controls', async () => {
      const { mount, editor } = setup(undefined, { lookupLastChange: lookup });
      const wrapper = await mount();
      editor.state.draft.rolloutPercentage = 40;
      await flushPromises();

      editor.receiveRemote(elsewhere({ enabled: true }));
      await flushPromises();

      const banner = wrapper.get('[role="alert"]');
      expect(banner.text()).toContain('maria@example.com made a change');
      expect(banner.findAll('dd').map((d) => d.text())).toEqual(['Enabled', 'Rollout']);
      expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('40'); // nothing lost
      expect(wrapper.get('[role="switch"]').attributes('disabled')).toBeDefined();
      expect(wrapper.find('[aria-label="Unsaved changes"]').exists()).toBe(false); // resolve it first
    });

    it('"Load latest" shows the new state and drops the edits', async () => {
      const { mount, editor, send } = setup();
      const wrapper = await mount();
      editor.state.draft.rolloutPercentage = 40;
      editor.receiveRemote(elsewhere({ enabled: true }));
      await flushPromises();

      await wrapper
        .findAll('button')
        .find((b) => b.text().startsWith('Load latest'))!
        .trigger('click');
      await flushPromises();

      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
      expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('0');
      expect(send).not.toHaveBeenCalled();
    });

    it('"Apply my changes on latest" keeps the edits on the new state and the next save uses the new revision', async () => {
      const { mount, editor, send } = setup();
      const wrapper = await mount();
      editor.state.draft.rolloutPercentage = 40;
      editor.receiveRemote(elsewhere({ enabled: true }));
      await flushPromises();

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Apply my changes on latest')!
        .trigger('click');
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true'); // their change is visible
      expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('40'); // so are mine
      expect(send).not.toHaveBeenCalled(); // not saved yet

      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Save changes')!
        .trigger('click');
      await flushPromises();
      expect(send).toHaveBeenCalledWith('PATCH', '', { revision: 2, rolloutPercentage: 40 });
    });

    it('turns a 409 on the switch into the same banner, with the switch kept as an unsaved edit', async () => {
      const { mount, send } = setup();
      const conflictResponse = Object.assign(new Error('x'), {});
      send.mockRejectedValueOnce(
        Object.assign(
          new (await import('../../app/utils/api-error')).ApiError(409, 'changed', {
            current: elsewhere({ rolloutPercentage: 5 }),
          }),
          conflictResponse,
        ),
      );
      const wrapper = await mount();

      await wrapper.get('[role="switch"]').trigger('click');
      await flushPromises();

      const banner = wrapper.get('[role="alert"]');
      expect(banner.findAll('dd').map((d) => d.text())).toEqual(['Rollout', 'Enabled']);
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    });

    it('updates quietly when there is nothing unsaved', async () => {
      const { mount, editor } = setup();
      const wrapper = await mount();

      editor.receiveRemote(elsewhere({ enabled: true, rolloutPercentage: 70 }));
      await flushPromises();

      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true');
      expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('70');
      expect(wrapper.text()).toContain('revision 2');
    });

    it('still shows the banner when the actor cannot be looked up', async () => {
      const failing = vi.fn(async () => {
        throw new Error('audit unavailable');
      });
      const { mount, editor } = setup(undefined, { lookupLastChange: failing });
      const wrapper = await mount();
      editor.state.draft.rolloutPercentage = 40;
      editor.receiveRemote(elsewhere({ enabled: true }));
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toContain('Someone made a change');
    });
  });
});
