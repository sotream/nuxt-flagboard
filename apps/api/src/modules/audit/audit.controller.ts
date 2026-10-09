import { Controller, Get, Param, Query } from '@nestjs/common';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { AuditService } from './audit.service.js';
import { ListAuditQuery } from './dto/list-audit.query.js';

@Controller(`${ADMIN_PREFIX}/projects/:projectKey/audit`)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Read-only for every signed-in user, viewers included. There is no route that changes or deletes events. */
  @Get()
  list(@Param('projectKey') projectKey: string, @Query() query: ListAuditQuery) {
    return this.audit.list(projectKey, query);
  }
}
