import type { AuditEventView } from './api-types';

const ACTION_LABELS: Record<string, string> = {
  'project.created': 'Created the project',
  'flag.created': 'Created the flag',
  'flag.updated': 'Edited the flag',
  'flag.archived': 'Archived or restored the flag',
  'flag.environment.updated': 'Changed an environment',
  'flag.kill_switch.enabled': 'Switched the kill switch on',
  'flag.kill_switch.disabled': 'Released the kill switch',
  'api_key.created': 'Created an API key',
  'api_key.revoked': 'Revoked an API key',
};

const FIELD_LABELS: Record<string, string> = {
  enabled: 'Enabled',
  rolloutPercentage: 'Rollout',
  rules: 'Rules',
  killSwitch: 'Kill switch',
  killReason: 'Kill switch reason',
  name: 'Name',
  description: 'Description',
  clientVisible: 'Visible to client keys',
  archived: 'Archived',
  key: 'Key',
  type: 'Type',
  onValue: 'On value',
  offValue: 'Off value',
  kind: 'Kind',
  prefix: 'Key prefix',
  id: 'Id',
};

/** The sentence for an event. Unknown actions (added later) are shown as they are, not hidden. */
export function actionLabel(event: Pick<AuditEventView, 'action' | 'after'>): string {
  if (event.action === 'flag.archived') {
    return (event.after as { archived?: boolean } | null)?.archived === false
      ? 'Restored the flag'
      : 'Archived the flag';
  }
  return ACTION_LABELS[event.action] ?? event.action;
}

export interface FieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

/** A value for people: booleans as on/off-style words, empty as a dash, rule lists as a count. */
export function formatValue(field: string, value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (field === 'rules' && Array.isArray(value))
    return value.length === 1 ? '1 rule' : `${value.length} rules`;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * The fields an event changed, with their old and new values. For a creation there is no "before", so the fields of
 * "after" are listed with a dash on the left. Fields that did not change are not repeated.
 */
export function describeChanges(event: Pick<AuditEventView, 'before' | 'after'>): FieldChange[] {
  const before = event.before ?? {};
  const after = event.after ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      before: formatValue(field, before[field]),
      after: formatValue(field, after[field]),
    }));
}
