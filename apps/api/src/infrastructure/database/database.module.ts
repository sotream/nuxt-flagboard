import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables } from '../config/env.validation.js';
import { buildBaseOptions } from './data-source-options.js';

/** Runtime connection as the application role (data access only). */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: (env: EnvironmentVariables) => ({
        ...buildBaseOptions(env.DATABASE_URL),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
