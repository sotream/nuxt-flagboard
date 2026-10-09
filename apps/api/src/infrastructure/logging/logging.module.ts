import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { EnvironmentVariables } from '../config/env.validation.js';
import { REDACT_PATHS, REDACTED } from './redaction.js';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [EnvironmentVariables],
      useFactory: (env: EnvironmentVariables) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: { paths: REDACT_PATHS, censor: REDACTED },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
