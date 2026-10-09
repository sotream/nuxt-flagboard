import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { Role } from '../../common/enums/role.enum.js';
import { sha256 } from '../../common/utils/hash.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../common/utils/password.js';
import { EnvironmentVariables } from '../../infrastructure/config/env.validation.js';
import { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  /** The raw refresh token. It goes into a cookie and is never stored or returned in a body. */
  refreshToken: string;
  user: PublicUser;
}

type RefreshOutcome =
  | { kind: 'ok'; user: User; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'reuse'; familyId: string };

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly env: EnvironmentVariables,
  ) {}

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email);
    // Always run one bcrypt comparison, so the response time does not reveal whether the email exists.
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const refreshToken = await this.createRefreshToken(
      this.dataSource.manager,
      user.id,
      randomUUID(),
    );
    return this.buildResult(user, refreshToken);
  }

  /**
   * Rotates the refresh token: the presented token is revoked and a new one in the same family is issued.
   * Presenting a token that was already revoked means it was copied or replayed, so the whole family is
   * revoked and the real holder has to sign in again. That is the safe outcome.
   */
  async refresh(presented: string): Promise<AuthResult> {
    const outcome = await this.rotate(presented);
    if (outcome.kind === 'reuse') {
      await this.revokeFamily(outcome.familyId);
    }
    if (outcome.kind !== 'ok') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.buildResult(outcome.user, outcome.refreshToken);
  }

  /** Revokes the whole sign-in session of the presented token. Unknown tokens are ignored (idempotent). */
  async logout(presented: string): Promise<void> {
    const row = await this.tokens.findOne({ where: { tokenHash: sha256(presented) } });
    if (row) {
      await this.revokeFamily(row.familyId);
    }
  }

  private rotate(presented: string): Promise<RefreshOutcome> {
    return this.dataSource.transaction(async (manager): Promise<RefreshOutcome> => {
      const row = await manager.findOne(RefreshToken, { where: { tokenHash: sha256(presented) } });
      if (!row) {
        return { kind: 'invalid' };
      }
      if (row.revokedAt) {
        return { kind: 'reuse', familyId: row.familyId };
      }
      if (row.expiresAt <= new Date()) {
        return { kind: 'invalid' };
      }
      // Atomic: of two concurrent requests with the same token only one updates a row, so a race cannot mint
      // two valid children. The loser is treated as reuse.
      const revoked = await manager.update(
        RefreshToken,
        { id: row.id, revokedAt: IsNull() },
        { revokedAt: () => 'now()' },
      );
      if (revoked.affected !== 1) {
        return { kind: 'reuse', familyId: row.familyId };
      }
      const user = await manager.findOne(User, { where: { id: row.userId } });
      if (!user) {
        return { kind: 'invalid' };
      }
      const refreshToken = await this.createRefreshToken(manager, user.id, row.familyId);
      return { kind: 'ok', user, refreshToken };
    });
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.tokens.update({ familyId, revokedAt: IsNull() }, { revokedAt: () => 'now()' });
  }

  private async createRefreshToken(
    manager: EntityManager,
    userId: string,
    familyId: string,
  ): Promise<string> {
    // 384 random bits: unguessable, so storing only a fast hash of it is enough.
    const raw = randomBytes(48).toString('base64url');
    await manager.insert(RefreshToken, {
      userId,
      familyId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    });
    return raw;
  }

  private async buildResult(user: User, refreshToken: string): Promise<AuthResult> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
