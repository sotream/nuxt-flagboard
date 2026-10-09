import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { ApiKeysService } from './api-keys.service.js';
import { CreateApiKeyDto } from './dto/create-api-key.dto.js';

@Controller(`${ADMIN_PREFIX}/projects/:projectKey/keys`)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  /** The response carries the full key. It is shown once; only a hash is stored. */
  @Post()
  @Roles(Role.Admin)
  create(
    @Param('projectKey') projectKey: string,
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.keys.create(projectKey, dto, actor);
  }

  @Get()
  list(@Param('projectKey') projectKey: string) {
    return this.keys.list(projectKey);
  }

  @Delete(':keyId')
  @Roles(Role.Admin)
  @HttpCode(204)
  revoke(
    @Param('projectKey') projectKey: string,
    @Param('keyId', ParseUUIDPipe) keyId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.keys.revoke(projectKey, keyId, actor);
  }
}
