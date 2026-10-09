import type { AttributeValue, Rule } from '@flagboard/core';

export type EnvironmentKey = 'dev' | 'staging' | 'prod';
export const ENVIRONMENT_KEYS: EnvironmentKey[] = ['dev', 'staging', 'prod'];

/** The shapes the admin API returns (see apps/api). Dates arrive as ISO strings. */
export interface ProjectView {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  environments: { id: string; key: EnvironmentKey }[];
}

export interface FlagEnvironmentView {
  environment: EnvironmentKey;
  enabled: boolean;
  rolloutPercentage: number;
  rules: Rule[];
  killSwitch: boolean;
  killReason: string | null;
  revision: number;
  updatedAt: string;
}

export interface FlagView {
  key: string;
  name: string;
  description: string;
  type: 'boolean' | 'string';
  onValue: boolean | string;
  offValue: boolean | string;
  clientVisible: boolean;
  archivedAt: string | null;
  createdAt: string;
  environments: FlagEnvironmentView[];
}

export interface ApiKeyView {
  id: string;
  name: string;
  kind: 'server' | 'client';
  environment: EnvironmentKey;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
  createdByEmail: string | null;
}

export interface CreatedApiKey extends ApiKeyView {
  /** Shown once. */
  key: string;
}

export interface AuditEventView {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  flagKey: string | null;
  environmentKey: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEventView[];
  nextCursor: string | null;
}

export type { AttributeValue, Rule };
