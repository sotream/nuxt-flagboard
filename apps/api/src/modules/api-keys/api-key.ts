import { randomBytes } from 'node:crypto';
import { sha256 } from '../../common/utils/hash.js';

export const API_KEY_KINDS = ['server', 'client'] as const;
export type ApiKeyKind = (typeof API_KEY_KINDS)[number];

const KIND_PREFIX: Record<ApiKeyKind, string> = { server: 'fb_srv_', client: 'fb_cli_' };
/** 32 random bytes, base64url without padding. */
const SECRET_LENGTH = 43;
/** How much of a key is shown later in lists: the kind prefix plus four characters. */
const DISPLAY_PREFIX_LENGTH = 11;
const WELL_FORMED = /^fb_(srv|cli)_[A-Za-z0-9_-]{43}$/;

export interface GeneratedApiKey {
  /** The full key. Shown to the user once and never stored. */
  plaintext: string;
  /** Safe to store and display: identifies the key without revealing it. */
  prefix: string;
  /** What is stored and looked up. */
  hash: string;
}

/** 256 random bits: unguessable, so a fast SHA-256 is enough at rest (see the API key storage ADR). */
export function generateApiKey(kind: ApiKeyKind): GeneratedApiKey {
  const plaintext = KIND_PREFIX[kind] + randomBytes(32).toString('base64url');
  return { plaintext, prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH), hash: sha256(plaintext) };
}

export const hashApiKey = sha256;

/** Cheap shape check so garbage is rejected before any hashing or database lookup. */
export const isWellFormedApiKey = (value: string): boolean =>
  value.length === DISPLAY_PREFIX_LENGTH - 4 + SECRET_LENGTH && WELL_FORMED.test(value);
