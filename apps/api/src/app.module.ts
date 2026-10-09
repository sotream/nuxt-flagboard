import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RetryAfterThrottlerGuard } from './infrastructure/rate-limit/retry-after-throttler.guard.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { ConfigModule } from './infrastructure/config/config.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { LoggingModule } from './infrastructure/logging/logging.module.js';
import { RateLimitModule } from './infrastructure/rate-limit/rate-limit.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { FlagsModule } from './modules/flags/flags.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    RateLimitModule,
    UsersModule,
    AuthModule,
    AuditModule,
    ProjectsModule,
    FlagsModule,
  ],
  providers: [
    // Order matters: limit first (before any bcrypt work), then authenticate, then authorize.
    { provide: APP_GUARD, useClass: RetryAfterThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
