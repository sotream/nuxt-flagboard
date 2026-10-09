import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { FlagEnvironment } from './entities/flag-environment.entity.js';
import { Flag } from './entities/flag.entity.js';
import { FlagChangeBus } from './flag-change.bus.js';
import { FlagEnvironmentsController } from './flag-environments.controller.js';
import { FlagEnvironmentsService } from './flag-environments.service.js';
import { FlagsController } from './flags.controller.js';
import { FlagsService } from './flags.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Flag, FlagEnvironment]), ProjectsModule, AuditModule],
  controllers: [FlagsController, FlagEnvironmentsController],
  providers: [FlagsService, FlagEnvironmentsService, FlagChangeBus],
  exports: [FlagsService, FlagChangeBus],
})
export class FlagsModule {}
