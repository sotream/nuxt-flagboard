import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { ADMIN_PREFIX } from '../../common/routes.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UsersService } from './users.service.js';
import type { PublicUser } from './users.service.js';

@Controller(`${ADMIN_PREFIX}/users`)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @Roles(Role.Admin)
  create(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return this.users.createViewer(dto.email, dto.password);
  }
}
