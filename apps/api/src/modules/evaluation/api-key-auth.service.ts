import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { DataSource } from 'typeorm';
import { ApiKeysService } from '../api-keys/api-keys.service.js';
import type { ApiKeyKind } from '../api-keys/api-key.js';
import type { ApiKeyPrincipal } from './api-key-principal.js';

/** How long "this key does not exist" is remembered. Short, so a key created a moment later works. */
export const UNKNOWN_KEY_CACHE_MS = 5_000;
const MAX_UNKNOWN_ENTRIES = 10_000;

interface KeyRow {
  id: string;
  kind: ApiKeyKind;
  environment_id: string;
  environment_key: string;
  project_id: string;
}

/**
 * Resolves a key hash to the key's environment. Valid keys are cached until the key is revoked (single
 * instance, see the single-instance ADR); unknown ones for a few seconds only, so random guesses cannot
 * make the database do the same lookup twice but a freshly created key is not locked out.
 */
@Injectable()
export class ApiKeyAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly known = new Map<string, ApiKeyPrincipal>();
  private readonly unknown = new Map<string, number>();
  private subscription?: Subscription;

  constructor(
    private readonly dataSource: DataSource,
    private readonly apiKeys: ApiKeysService,
  ) {}

  private now(): number {
    return Date.now();
  }

  onModuleInit(): void {
    this.subscription = this.apiKeys.revoked$.subscribe((keyId) => this.forget(keyId));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** The principal if this key is already known to be valid, with no database access. */
  cached(hash: string): ApiKeyPrincipal | undefined {
    return this.known.get(hash);
  }

  /** Looks the key up (the database, unless it is cached). `null` means unknown or revoked. */
  async lookup(hash: string): Promise<ApiKeyPrincipal | null> {
    const known = this.known.get(hash);
    if (known) {
      return known;
    }
    const expires = this.unknown.get(hash);
    if (expires !== undefined && expires > this.now()) {
      return null;
    }
    const rows = await this.dataSource.query<KeyRow[]>(
      `SELECT k.id, k.kind, k.environment_id, e.key AS environment_key, e.project_id
       FROM api_keys k JOIN environments e ON e.id = k.environment_id
       WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
      [hash],
    );
    const row = rows[0];
    if (!row) {
      this.rememberUnknown(hash);
      return null;
    }
    const principal: ApiKeyPrincipal = {
      keyId: row.id,
      kind: row.kind,
      environmentId: row.environment_id,
      environmentKey: row.environment_key,
      projectId: row.project_id,
    };
    this.known.set(hash, principal);
    return principal;
  }

  private forget(keyId: string): void {
    for (const [hash, principal] of this.known) {
      if (principal.keyId === keyId) {
        this.known.delete(hash);
      }
    }
  }

  private rememberUnknown(hash: string): void {
    if (this.unknown.size >= MAX_UNKNOWN_ENTRIES) {
      const now = this.now();
      for (const [candidate, expires] of this.unknown) {
        if (expires <= now) this.unknown.delete(candidate);
      }
      if (this.unknown.size >= MAX_UNKNOWN_ENTRIES) {
        this.unknown.clear();
      }
    }
    this.unknown.set(hash, this.now() + UNKNOWN_KEY_CACHE_MS);
  }
}
