import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { filter, finalize, interval, map, merge, startWith, takeUntil, timer } from 'rxjs';
import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';
import { FlagChangeBus } from '../flags/flag-change.bus.js';
import { ProjectsService } from '../projects/projects.service.js';
import { StreamRegistry } from './stream-registry.service.js';

@Injectable()
export class EventsService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly bus: FlagChangeBus,
    private readonly registry: StreamRegistry,
    private readonly env: EnvironmentVariables,
  ) {}

  /**
   * A stream of what changed in one project: `ready` once when it opens, `flag.changed` for each committed change
   * (the event only says what changed and its new revision, so the client re-reads the data) and `heartbeat`
   * while idle. Events of other projects never reach it: filtering happens here, on the server. The stream ends
   * when the access token expires (the client reconnects with a fresh one), when the user opens too many streams
   * and this is the oldest, or on shutdown.
   */
  async open(projectKey: string, user: AuthenticatedUser): Promise<Observable<MessageEvent>> {
    const project = await this.projects.getByKey(projectKey);
    const registration = this.registry.register(user.id);
    const tokenExpired$ = timer(Math.max(0, user.expiresAt - Date.now()));

    const changes$ = this.bus.changes$.pipe(
      filter((change) => change.projectId === project.id),
      map((change): MessageEvent => ({
        type: 'flag.changed',
        data: {
          projectKey,
          flagKey: change.flagKey,
          environmentKey: change.environmentKey ?? null,
          revision: change.revision ?? null,
        },
      })),
    );
    const heartbeat$ = interval(this.env.SSE_HEARTBEAT_SECONDS * 1000).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(changes$, heartbeat$).pipe(
      startWith<MessageEvent>({ type: 'ready', data: {} }),
      takeUntil(merge(registration.closed$, tokenExpired$)),
      finalize(() => registration.release()),
    );
  }
}
