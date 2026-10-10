import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken]),
    UsersModule,
    JwtModule.registerAsync({
      inject: [EnvironmentVariables],
      useFactory: (env: EnvironmentVariables) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: {
          algorithm: JWT_ALGORITHM,
          expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        verifyOptions: { algorithms: [JWT_ALGORITHM], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenCleanupService],
  exports: [JwtModule],
})
export class AuthModule {}
