import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/entities/project.entity.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditEvent } from './entities/audit-event.entity.js';

/** Low-level module: it reads projects itself instead of importing ProjectsModule, so modules that record audit events can import it without a cycle. */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent, Project])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
