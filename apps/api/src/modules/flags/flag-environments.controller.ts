import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { EngageKillSwitchDto } from './dto/kill-switch.dto.js';
import { RevisionDto, UpdateFlagEnvironmentDto } from './dto/update-flag-environment.dto.js';
import { FlagEnvironmentsService } from './flag-environments.service.js';

@Controller(`${ADMIN_PREFIX}/projects/:projectKey/flags/:flagKey/environments/:environmentKey`)
@Roles(Role.Admin)
export class FlagEnvironmentsController {
  constructor(private readonly environments: FlagEnvironmentsService) {}

  @Patch()
  update(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() dto: UpdateFlagEnvironmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.environments.update(projectKey, flagKey, environmentKey, dto, actor);
  }

  @Post('kill-switch')
  @HttpCode(200)
  engageKillSwitch(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() dto: EngageKillSwitchDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.environments.engageKillSwitch(projectKey, flagKey, environmentKey, dto, actor);
  }

  @Post('kill-switch/release')
  @HttpCode(200)
  releaseKillSwitch(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('environmentKey') environmentKey: string,
    @Body() dto: RevisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.environments.releaseKillSwitch(
      projectKey,
      flagKey,
      environmentKey,
      dto.revision,
      actor,
    );
  }
}
