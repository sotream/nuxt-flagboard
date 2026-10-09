import type { Request } from 'express';
import type { ApiKeyKind } from '../api-keys/api-key.js';

/** Who an API key authenticates as: one environment of one project. */
export interface ApiKeyPrincipal {
  keyId: string;
  kind: ApiKeyKind;
  environmentId: string;
  environmentKey: string;
  projectId: string;
}

export type RequestWithApiKey = Request & { apiKey?: ApiKeyPrincipal };
