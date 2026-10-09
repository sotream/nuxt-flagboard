import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';

@Module({ imports: [ConfigModule, LoggingModule, DatabaseModule] })
export class AppModule {}
