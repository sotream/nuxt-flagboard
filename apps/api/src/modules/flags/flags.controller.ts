import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { CreateFlagDto } from './dto/create-flag.dto.js';
import { ListFlagsQuery } from './dto/list-flags.query.js';
import { UpdateFlagDto } from './dto/update-flag.dto.js';
import { FlagsService } from './flags.service.js';

@Controller(`${ADMIN_PREFIX}/projects/:projectKey/flags`)
export class FlagsController {
  constructor(private readonly flags: FlagsService) {}

  @Post()
  @Roles(Role.Admin)
  async create(
    @Param('projectKey') projectKey: string,
    @Body() dto: CreateFlagDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const created = await this.flags.create(projectKey, dto, actor);
    // RFC 9110 §10.2.2: for a 201, Location is the primary resource that was created. Set only after it was.
    response.location(
      `/${ADMIN_PREFIX}/projects/${encodeURIComponent(projectKey)}/flags/${encodeURIComponent(dto.key)}`,
    );
    return created;
  }

  @Get()
  list(@Param('projectKey') projectKey: string, @Query() query: ListFlagsQuery) {
    return this.flags.list(projectKey, query);
  }

  @Get(':flagKey')
  get(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string) {
    return this.flags.get(projectKey, flagKey);
  }

  @Patch(':flagKey')
  @Roles(Role.Admin)
  update(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Body() dto: UpdateFlagDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.flags.update(projectKey, flagKey, dto, actor);
  }
}
