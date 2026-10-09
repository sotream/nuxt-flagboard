import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';

/**
 * A flag changed. Published after the change committed, so listeners never see a change that was rolled back.
 * Without `environmentKey` the change touches every environment (for example a new, archived or renamed flag).
 */
export interface FlagChange {
  projectId: string;
  flagKey: string;
  environmentKey?: string;
  revision?: number;
}

/** In-process (a single API instance). The snapshot cache and the SSE streams listen to it. */
@Injectable()
export class FlagChangeBus {
  private readonly subject = new Subject<FlagChange>();
  readonly changes$: Observable<FlagChange> = this.subject.asObservable();

  publish(change: FlagChange): void {
    this.subject.next(change);
  }
}
