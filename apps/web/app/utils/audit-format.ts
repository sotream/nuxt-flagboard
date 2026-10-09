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

/** The sentence for an event. Unknown actions (added later) are shown as they are, not hidden. */
export function actionLabel(event: Pick<AuditEventView, 'action' | 'after'>): string {
  if (event.action === 'flag.archived') {
    return (event.after as { archived?: boolean } | null)?.archived === false
      ? 'Restored the flag'
      : 'Archived the flag';
  }
  return ACTION_LABELS[event.action] ?? event.action;
}
