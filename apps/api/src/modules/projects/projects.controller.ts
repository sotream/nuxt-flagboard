import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { ListProjectsQuery } from './dto/list-projects.query.js';
import { ProjectsService } from './projects.service.js';

@Controller(`${ADMIN_PREFIX}/projects`)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @Roles(Role.Admin)
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const created = await this.projects.create(dto.key, dto.name, actor);
    // RFC 9110 §10.2.2: for a 201, Location is the primary resource that was created. Set only after it was.
    response.location(`/${ADMIN_PREFIX}/projects/${encodeURIComponent(dto.key)}`);
    return created;
  }

  @Get()
  list(@Query() query: ListProjectsQuery) {
    return this.projects.list(query.search);
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.projects.getByKey(key);
  }
}
