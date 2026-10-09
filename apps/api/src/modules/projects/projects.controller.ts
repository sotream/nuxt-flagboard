import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
  create(@Body() dto: CreateProjectDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.projects.create(dto.key, dto.name, actor);
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
