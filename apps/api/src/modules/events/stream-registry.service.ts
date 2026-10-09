import { Injectable } from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';

export interface StreamRegistration {
  /** Emits once when the stream must end: it was evicted by a newer one, or the server is shutting down. */
  closed$: Observable<void>;
  /** Call when the stream ended for any reason. */
  release: () => void;
}

interface Entry {
  close: () => void;
}

/**
 * Tracks the open live-update streams per user. A user may have at most `SSE_MAX_STREAMS_PER_USER`: opening one
 * more closes the oldest instead of refusing the new one, so a browser tab that lost its connection and
 * reconnects is never locked out by its own dead stream. In memory, so single instance.
 */
@Injectable()
export class StreamRegistry implements BeforeApplicationShutdown {
  private readonly streams = new Map<string, Entry[]>();

  constructor(private readonly env: EnvironmentVariables) {}

  register(userId: string): StreamRegistration {
    const closed = new Subject<void>();
    const entry: Entry = { close: () => closed.next() };
    const mine = this.streams.get(userId) ?? [];
    while (mine.length >= this.env.SSE_MAX_STREAMS_PER_USER) {
      mine.shift()?.close();
    }
    mine.push(entry);
    this.streams.set(userId, mine);

    return {
      closed$: closed.asObservable(),
      release: () => {
        const remaining = (this.streams.get(userId) ?? []).filter(
          (candidate) => candidate !== entry,
        );
        if (remaining.length > 0) this.streams.set(userId, remaining);
        else this.streams.delete(userId);
      },
    };
  }

  /** Number of open streams of a user. */
  count(userId: string): number {
    return this.streams.get(userId)?.length ?? 0;
  }

  /** Ends every open stream, so a shutdown does not wait for clients that never disconnect. */
  closeAll(): void {
    for (const entries of [...this.streams.values()]) {
      for (const entry of [...entries]) entry.close();
    }
  }

  beforeApplicationShutdown(): void {
    this.closeAll();
  }
}
