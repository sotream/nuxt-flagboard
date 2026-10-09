import { Controller, Header, Param, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { EventsService } from './events.service.js';

@Controller(`${ADMIN_PREFIX}/projects/:projectKey/events`)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /**
   * Live updates over Server-Sent Events, for admins and viewers. It is a `GET`, so every signed-in user may open
   * it. The browser `EventSource` cannot send an `Authorization` header, so the web app reads this stream with
   * `fetch` instead.
   */
  @Sse()
  // Tell reverse proxies (nginx) not to buffer the stream.
  @Header('X-Accel-Buffering', 'no')
  stream(
    @Param('projectKey') projectKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Observable<MessageEvent>> {
    return this.events.open(projectKey, user);
  }
}
