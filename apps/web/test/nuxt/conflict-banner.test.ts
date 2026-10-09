import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import ConflictBanner from '../../app/components/ConflictBanner.vue';
import type { Conflict } from '../../app/utils/env-editor';
import { draftFrom } from '../../app/utils/flag-editor';
import { environment } from '../unit/flag-editor.test';

const base = environment({ environment: 'prod' });
const current = environment({
  environment: 'prod',
  enabled: true,
  rolloutPercentage: 10,
  revision: 2,
  updatedAt: '2026-10-09T10:32:00.000Z',
});
const conflict: Conflict = { current, base, attempt: {} };

const mountBanner = (props: Record<string, unknown> = {}) =>
  mountSuspended(ConflictBanner, {
    props: {
      conflict,
      draft: { ...draftFrom(base), rolloutPercentage: 40 },
      environment: 'prod',
      ...props,
    } as never,
    attachTo: document.body,
  });

/** The term and description pairs of the banner, as an object. */
const terms = (wrapper: Awaited<ReturnType<typeof mountBanner>>) =>
  Object.fromEntries(
    wrapper.findAll('dt').map((dt, i) => [dt.text(), wrapper.findAll('dd')[i]!.text()]),
  );

describe('ConflictBanner', () => {
  it('is an alert that names who changed it and when, and says nothing was lost', async () => {
    const wrapper = await mountBanner({
      actor: { email: 'maria@example.com', at: '2026-10-09T10:35:00.000Z' },
    });

    const alert = wrapper.get('[role="alert"]');
    expect(alert.get('h3').text()).toBe('prod was changed while you were working');
    expect(alert.text()).toContain('maria@example.com made a change at');
    expect(alert.get('time').attributes('datetime')).toBe('2026-10-09T10:35:00.000Z');
    expect(alert.text()).toContain('Nothing you typed has been lost');
  });

  it('falls back to "Someone" and the time on the new state when the actor is unknown', async () => {
    const wrapper = await mountBanner();
    expect(wrapper.text()).toContain('Someone made a change at');
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-10-09T10:32:00.000Z');
  });

  it('moves focus to its heading so it is noticed', async () => {
    const wrapper = await mountBanner();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(wrapper.get('#conflict-title').element);
  });

  it('lists the fields each side changed, and warns about the ones both changed', async () => {
    const wrapper = await mountBanner();

    expect(terms(wrapper)).toEqual({
      'Changed by them:': 'Enabled, Rollout',
      'Your unsaved changes:': 'Rollout',
    });
    expect(wrapper.text()).toContain(
      'You both changed Rollout. If you apply your changes, yours replace theirs there.',
    );
  });

  it('offers both ways forward and tells the parent which one was chosen', async () => {
    const wrapper = await mountBanner();

    await wrapper
      .findAll('button')
      .find((b) => b.text().startsWith('Load latest'))!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Apply my changes on latest')!
      .trigger('click');

    expect(wrapper.emitted('load-latest')).toHaveLength(1);
    expect(wrapper.emitted('apply-mine')).toHaveLength(1);
  });

  it('offers only "Load latest" when the person has nothing of their own to apply', async () => {
    const wrapper = await mountBanner({ draft: draftFrom(base) });
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual([
      'Load latest and discard my changes',
    ]);
    expect(terms(wrapper)).not.toHaveProperty('Your unsaved changes:');
  });

  it("shows a failed kill switch action as the person's change", async () => {
    const wrapper = await mountBanner({
      conflict: { ...conflict, description: 'Switch the kill switch on' },
      draft: draftFrom(base),
    });
    expect(terms(wrapper)['Your unsaved changes:']).toBe('Switch the kill switch on');
    expect(wrapper.findAll('button').some((b) => b.text() === 'Apply my changes on latest')).toBe(
      true,
    );
  });

  it('disables both actions while one is running', async () => {
    const wrapper = await mountBanner({ pending: true });
    expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(
      true,
    );
  });
});
