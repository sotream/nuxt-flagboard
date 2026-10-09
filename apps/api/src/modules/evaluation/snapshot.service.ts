import { createHash } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { FlagConfig, Rule } from '@flagboard/core';
import type { Subscription } from 'rxjs';
import { DataSource } from 'typeorm';
import { FlagChangeBus } from '../flags/flag-change.bus.js';
import type { FlagChange } from '../flags/flag-change.bus.js';
import { parseFlagValue } from '../flags/flag-values.js';
import type { FlagType } from '../flags/flag-values.js';
import type { ApiKeyPrincipal } from './api-key-principal.js';
import { canonicalJson } from './canonical-json.js';

/** A flag as held in memory for evaluation. `clientVisible` decides what a client key may see. */
export interface EvaluableFlag {
  config: FlagConfig;
  clientVisible: boolean;
}

export interface EnvironmentSnapshot {
  /** Strong validator for `If-None-Match`. */
  etag: string;
  /** The exact JSON a server key receives from `GET /v1/snapshot`. */
  body: string;
  flags: Map<string, EvaluableFlag>;
}

interface Row {
  key: string;
  type: FlagType;
  on_value: string;
  off_value: string;
  salt: string;
  client_visible: boolean;
  enabled: boolean;
  rollout_percentage: number;
  rules: Rule[];
  kill_switch: boolean;
}

interface CacheEntry {
  projectId: string;
  environmentKey: string;
  snapshot: Promise<EnvironmentSnapshot>;
}

/**
 * Builds and caches the configuration of one environment. The ETag is the SHA-256 of a deterministic
 * serialisation (flags ordered by key, keys sorted, no timestamps), so it changes exactly when the configuration
 * does. Any change to the environment therefore invalidates every SDK cache of that environment, which is
 * simple and always correct. Entries are dropped when a flag in the project changes (single instance).
 */
@Injectable()
export class SnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<string, CacheEntry>();
  private subscription?: Subscription;

  constructor(
    private readonly dataSource: DataSource,
    private readonly bus: FlagChangeBus,
  ) {}

  onModuleInit(): void {
    this.subscription = this.bus.changes$.subscribe((change) => this.invalidate(change));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get(principal: ApiKeyPrincipal): Promise<EnvironmentSnapshot> {
    const cached = this.cache.get(principal.environmentId);
    if (cached) {
      return cached.snapshot;
    }
    const snapshot = this.build(principal);
    this.cache.set(principal.environmentId, {
      projectId: principal.projectId,
      environmentKey: principal.environmentKey,
      snapshot,
    });
    snapshot.catch(() => this.cache.delete(principal.environmentId));
    return snapshot;
  }

  private invalidate(change: FlagChange): void {
    for (const [environmentId, entry] of this.cache) {
      const affected =
        entry.projectId === change.projectId &&
        (change.environmentKey === undefined || change.environmentKey === entry.environmentKey);
      if (affected) {
        this.cache.delete(environmentId);
      }
    }
  }

  private async build(principal: ApiKeyPrincipal): Promise<EnvironmentSnapshot> {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT f.key, f.type, f.on_value, f.off_value, f.salt, f.client_visible,
              fe.enabled, fe.rollout_percentage, fe.rules, fe.kill_switch
       FROM flag_environments fe JOIN flags f ON f.id = fe.flag_id
       WHERE fe.environment_id = $1 AND f.archived_at IS NULL
       ORDER BY f.key`,
      [principal.environmentId],
    );
    const flags = new Map<string, EvaluableFlag>();
    for (const row of rows) {
      flags.set(row.key, {
        clientVisible: row.client_visible,
        config: {
          key: row.key,
          type: row.type,
          onValue: parseFlagValue(row.type, row.on_value),
          offValue: parseFlagValue(row.type, row.off_value),
          salt: row.salt,
          enabled: row.enabled,
          rolloutPercentage: row.rollout_percentage,
          rules: row.rules,
          killSwitch: row.kill_switch,
        },
      });
    }
    const body = canonicalJson({
      environment: principal.environmentKey,
      flags: [...flags.values()].map((flag) => flag.config),
    });
    return {
      etag: `"${createHash('sha256').update(body).digest('hex')}"`,
      body,
      flags,
    };
  }
}
