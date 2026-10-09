import type { FlagEnvironmentView, Rule } from './api-types';

/** What a person can edit in one environment of a flag. */
export interface Draft {
  enabled: boolean;
  rolloutPercentage: number;
  rules: Rule[];
}
export type DraftField = keyof Draft;

export const DRAFT_FIELDS: DraftField[] = ['enabled', 'rolloutPercentage', 'rules'];
export const FIELD_LABELS: Record<DraftField, string> = {
  enabled: 'Enabled',
  rolloutPercentage: 'Rollout',
  rules: 'Targeting rules',
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** An editable copy of what the server holds. */
export const draftFrom = (environment: FlagEnvironmentView): Draft => ({
  enabled: environment.enabled,
  rolloutPercentage: environment.rolloutPercentage,
  rules: clone(environment.rules),
});

/** Deep equality that ignores the order of object keys (the server may order them differently than the UI does). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => sameValue(left[key], right[key]))
  );
}

/** The editable fields in which two states differ. */
export function changedFields(a: Draft, b: Draft): DraftField[] {
  return DRAFT_FIELDS.filter((field) => !sameValue(a[field], b[field]));
}

/** The values for `fields`, copied out of a draft, ready to send. */
export function pick(draft: Draft, fields: DraftField[]): Partial<Draft> {
  const picked: Partial<Draft> = {};
  for (const field of fields) {
    (picked as Record<DraftField, unknown>)[field] = clone(draft[field]);
  }
  return picked;
}

export const labelsOf = (fields: DraftField[]): string =>
  fields.map((field) => FIELD_LABELS[field]).join(', ');
