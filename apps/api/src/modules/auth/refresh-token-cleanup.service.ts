import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';

export const REFRESH_CLEANUP_BATCH_SIZE = 1000;
const MINUTE_MS = 60 * 1000;

/**
 * Deletes expired refresh tokens, revoked or not. A revoked row stays until its own expiry on purpose: reuse
 * detection needs it for as long as the token could still be presented, and after expiry the token is rejected
 * anyway, so there is nothing left to detect.
 *
 * Runs on a timer inside the API (a single instance). Rows are deleted in batches with `SKIP LOCKED`, so a
 * second instance running the same job would not block or double-delete.
 */
@Injectable()
export class RefreshTokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly env: EnvironmentVariables,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.purge().catch((error: unknown) =>
        this.logger.error(
          `Refresh token cleanup failed: ${error instanceof Error ? error.message : error}`,
        ),
      );
    }, this.env.REFRESH_CLEANUP_INTERVAL_MINUTES * MINUTE_MS);
    this.timer.unref(); // never keeps the process alive on its own
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Returns how many rows were deleted. */
  async purge(): Promise<number> {
    let total = 0;
    let deleted: number;
    do {
      deleted = await this.deleteBatch();
      total += deleted;
    } while (deleted === REFRESH_CLEANUP_BATCH_SIZE);
    if (total > 0) {
      this.logger.log(`Removed ${total} expired refresh tokens`);
    }
    return total;
  }

  private async deleteBatch(): Promise<number> {
    const [, affected] = (await this.dataSource.query(
      `DELETE FROM refresh_tokens WHERE id IN (
         SELECT id FROM refresh_tokens
         WHERE expires_at < now()
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )`,
      [REFRESH_CLEANUP_BATCH_SIZE],
    )) as [unknown, number];
    return affected;
  }
}
