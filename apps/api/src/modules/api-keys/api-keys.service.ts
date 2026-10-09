import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { EnvironmentKey } from '../projects/entities/environment.entity.js';
import { generateApiKey } from './api-key.js';
import type { ApiKeyKind } from './api-key.js';
import type { CreateApiKeyDto } from './dto/create-api-key.dto.js';
import { ApiKey } from './entities/api-key.entity.js';

/** What the API returns about a key. There is no field for the key or its hash, by design. */
export interface ApiKeyView {
  id: string;
  name: string;
  kind: ApiKeyKind;
  environment: EnvironmentKey;
  prefix: string;
  createdAt: Date;
  revokedAt: Date | null;
  createdByEmail: string | null;
}

export interface CreatedApiKey extends ApiKeyView {
  /** The only time the full key is ever returned. */
  key: string;
}

@Injectable()
export class ApiKeysService {
  private readonly revokedSubject = new Subject<string>();
  /** Emits a key's id after it was revoked and committed, so caches can drop it at once. */
  readonly revoked$: Observable<string> = this.revokedSubject.asObservable();

  constructor(
    @InjectRepository(ApiKey) private readonly keys: Repository<ApiKey>,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    projectKey: string,
    dto: CreateApiKeyDto,
    actor: AuthenticatedUser,
  ): Promise<CreatedApiKey> {
    const project = await this.projects.getByKey(projectKey);
    const environment = project.environments.find((candidate) => candidate.key === dto.environment);
    if (!environment) {
      throw new NotFoundException('Environment not found');
    }
    const generated = generateApiKey(dto.kind);

    const saved = await this.dataSource.transaction(async (manager) => {
      const row = await manager.save(ApiKey, {
        environmentId: environment.id,
        kind: dto.kind,
        name: dto.name,
        prefix: generated.prefix,
        keyHash: generated.hash,
        createdBy: actor.id,
      });
      // Only the prefix goes into the audit log: the key itself must never be written anywhere.
      await this.audit.record(manager, {
        projectId: project.id,
        actor,
        action: 'api_key.created',
        environmentKey: dto.environment,
        after: { id: row.id, name: dto.name, kind: dto.kind, prefix: generated.prefix },
      });
      return row;
    });

    return {
      id: saved.id,
      name: saved.name,
      kind: saved.kind,
      environment: dto.environment,
      prefix: saved.prefix,
      createdAt: saved.createdAt,
      revokedAt: null,
      createdByEmail: actor.email,
      key: generated.plaintext,
    };
  }

  async list(projectKey: string): Promise<ApiKeyView[]> {
    const project = await this.projects.getByKey(projectKey);
    const rows = await this.dataSource.query<
      {
        id: string;
        name: string;
        kind: ApiKeyKind;
        environment: EnvironmentKey;
        prefix: string;
        created_at: Date;
        revoked_at: Date | null;
        created_by_email: string | null;
      }[]
    >(
      `SELECT k.id, k.name, k.kind, e.key AS environment, k.prefix, k.created_at, k.revoked_at,
              u.email AS created_by_email
       FROM api_keys k
       JOIN environments e ON e.id = k.environment_id
       LEFT JOIN users u ON u.id = k.created_by
       WHERE e.project_id = $1
       ORDER BY k.created_at DESC, k.id DESC`,
      [project.id],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      environment: row.environment,
      prefix: row.prefix,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      createdByEmail: row.created_by_email,
    }));
  }

  /** Revokes a key. Revoking one that is already revoked succeeds without changing anything. */
  async revoke(projectKey: string, keyId: string, actor: AuthenticatedUser): Promise<void> {
    const project = await this.projects.getByKey(projectKey);
    const key = await this.keys
      .createQueryBuilder('key')
      .innerJoinAndSelect('key.environment', 'environment')
      .where('key.id = :keyId AND environment.projectId = :projectId', {
        keyId,
        projectId: project.id,
      })
      .getOne();
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    if (key.revokedAt) {
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.update(ApiKey, { id: key.id }, { revokedAt: new Date() });
      await this.audit.record(manager, {
        projectId: project.id,
        actor,
        action: 'api_key.revoked',
        environmentKey: key.environment.key,
        before: { id: key.id, name: key.name, kind: key.kind, prefix: key.prefix },
      });
    });
    this.revokedSubject.next(key.id);
  }
}
