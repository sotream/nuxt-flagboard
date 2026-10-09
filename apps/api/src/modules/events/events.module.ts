import { Module } from '@nestjs/common';
import { FlagsModule } from '../flags/flags.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { StreamRegistry } from './stream-registry.service.js';

@Module({
  imports: [FlagsModule, ProjectsModule],
  controllers: [EventsController],
  providers: [EventsService, StreamRegistry],
})
export class EventsModule {}
