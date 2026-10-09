import type { FlagEnvironmentView } from './api-types';
import type { Conflict } from './env-editor';
import { changedFields, draftFrom, FIELD_LABELS } from './flag-editor';
import type { Draft, DraftField } from './flag-editor';

export interface ConflictSummary {
  /** What the other change touched, in words. */
  theirs: string[];
  /** What this person has edited and not saved, in words. */
  mine: string[];
  /** Fields both sides changed: applying the edits replaces the other person's value there. */
  both: string[];
}

const killSwitchChanged = (a: FlagEnvironmentView, b: FlagEnvironmentView): boolean =>
  a.killSwitch !== b.killSwitch;

/** Compares three states: what the draft started from, what the server has now, and what the person is editing. */
export function summarizeConflict(conflict: Conflict, draft: Draft): ConflictSummary {
  const theirFields: DraftField[] = changedFields(
    draftFrom(conflict.current),
    draftFrom(conflict.base),
  );
  const myFields: DraftField[] = changedFields(draft, draftFrom(conflict.base));
  const label = (field: DraftField): string => FIELD_LABELS[field];

  const theirs = theirFields.map(label);
  if (killSwitchChanged(conflict.current, conflict.base)) theirs.push('Kill switch');
  const mine = myFields.map(label);
  if (conflict.description) mine.push(conflict.description);
  return {
    theirs,
    mine,
    both: theirFields.filter((field) => myFields.includes(field)).map(label),
  };
}
