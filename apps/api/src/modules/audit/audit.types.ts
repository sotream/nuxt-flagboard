export const AUDIT_ACTIONS = [
  'project.created',
  'flag.created',
  'flag.updated',
  'flag.archived',
  'flag.environment.updated',
  'flag.kill_switch.enabled',
  'flag.kill_switch.disabled',
  'api_key.created',
  'api_key.revoked',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditInput {
  projectId: string;
  actor: { id: string; email: string };
  action: AuditAction;
  flagKey?: string;
  environmentKey?: string;
  /** State before the change (omitted for creations). Never put secrets in here. */
  before?: object;
  /** State after the change. Never put secrets in here. */
  after?: object;
}
