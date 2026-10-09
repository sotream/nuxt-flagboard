import { describe, expect, it } from 'vitest';
import type { Rule } from '../../app/utils/api-types';
import { summarizeConflict } from '../../app/utils/conflict-summary';
import type { Conflict } from '../../app/utils/env-editor';
import { draftFrom } from '../../app/utils/flag-editor';
import { environment } from './flag-editor.test';

const rule: Rule = {
  serve: 'on',
  conditions: [{ attribute: 'country', operator: 'equals', value: 'UA' }],
};
const base = environment();
const conflictWith = (current = base, extra: Partial<Conflict> = {}): Conflict => ({
  current,
  base,
  attempt: {},
  ...extra,
});

describe('summarizeConflict', () => {
  it('lists what the other person changed and what this person edited', () => {
    const current = environment({ enabled: true, revision: 2 });
    const draft = { ...draftFrom(base), rolloutPercentage: 40 };

    expect(summarizeConflict(conflictWith(current), draft)).toEqual({
      theirs: ['Enabled'],
      mine: ['Rollout'],
      both: [],
    });
  });

  it('points out the fields both changed, because applying the edits replaces the other value there', () => {
    const current = environment({ rolloutPercentage: 10, rules: [rule], revision: 2 });
    const draft = { ...draftFrom(base), rolloutPercentage: 40 };

    expect(summarizeConflict(conflictWith(current), draft)).toEqual({
      theirs: ['Rollout', 'Targeting rules'],
      mine: ['Rollout'],
      both: ['Rollout'],
    });
  });

  it('mentions the kill switch when the other person used it', () => {
    const current = environment({ killSwitch: true, killReason: 'Incident', revision: 2 });
    expect(summarizeConflict(conflictWith(current), draftFrom(base)).theirs).toEqual([
      'Kill switch',
    ]);
  });

  it("describes a failed kill switch action as this person's change", () => {
    const current = environment({ rolloutPercentage: 20, revision: 2 });
    const summary = summarizeConflict(
      conflictWith(current, { description: 'Switch the kill switch on' }),
      draftFrom(base),
    );
    expect(summary.mine).toEqual(['Switch the kill switch on']);
    expect(summary.theirs).toEqual(['Rollout']);
  });

  it('is empty on both sides when nothing differs', () => {
    expect(summarizeConflict(conflictWith(), draftFrom(base))).toEqual({
      theirs: [],
      mine: [],
      both: [],
    });
  });

  it('does not count rules that are the same with their keys in another order', () => {
    const reordered: Rule = {
      conditions: [{ value: 'UA', operator: 'equals', attribute: 'country' }],
      serve: 'on',
    };
    const current = environment({ rules: [rule], revision: 2 });
    const baseWithRules = environment({ rules: [reordered] });
    expect(
      summarizeConflict({ current, base: baseWithRules, attempt: {} }, draftFrom(baseWithRules))
        .theirs,
    ).toEqual([]);
  });
});
