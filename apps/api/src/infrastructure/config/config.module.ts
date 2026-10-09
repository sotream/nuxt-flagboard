import { Global, Module } from '@nestjs/common';
import { EnvironmentVariables, validateEnv } from './env.validation.js';

/** Provides the validated environment. Inject it with `EnvironmentVariables` as the token. */
@Global()
@Module({
  providers: [{ provide: EnvironmentVariables, useFactory: () => validateEnv(process.env) }],
  exports: [EnvironmentVariables],
})
export class ConfigModule {}
