import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { isUniqueViolation } from '../../common/utils/db-errors.js';
import { escapeLike } from '../../common/utils/like.js';
import { AuditService } from '../audit/audit.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { CreateFlagDto } from './dto/create-flag.dto.js';
import type { ListFlagsQuery } from './dto/list-flags.query.js';
import type { UpdateFlagDto } from './dto/update-flag.dto.js';
import { Flag } from './entities/flag.entity.js';
import { FlagEnvironment } from './entities/flag-environment.entity.js';
import { FlagChangeBus } from './flag-change.bus.js';
import { resolveFlagValues } from './flag-values.js';
import { toFlagView } from './flag.view.js';
import type { FlagView } from './flag.view.js';

const WITH_STATE = { flagEnvironments: { environment: true } } as const;

@Injectable()
export class FlagsService {
  constructor(
    @InjectRepository(Flag) private readonly flags: Repository<Flag>,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
    private readonly bus: FlagChangeBus,
    private readonly dataSource: DataSource,
  ) {}

  /** Creates the flag and one disabled state per environment, plus its audit event, in one transaction. */
  async create(
    projectKey: string,
    dto: CreateFlagDto,
    actor: AuthenticatedUser,
  ): Promise<FlagView> {
    const project = await this.projects.getByKey(projectKey);
    const { onValue, offValue } = resolveFlagValues(dto.type, dto.onValue, dto.offValue);
    const draft = {
      projectId: project.id,
      key: dto.key,
      name: dto.name,
      description: dto.description ?? '',
      type: dto.type,
      onValue,
      offValue,
      // 128 random bits, fixed for the life of the flag so that every user stays in their rollout bucket.
      salt: randomBytes(16).toString('hex'),
      clientVisible: dto.clientVisible ?? false,
    };
    try {
      await this.dataSource.transaction(async (manager) => {
        const flag = await manager.save(Flag, draft);
        await manager.insert(
          FlagEnvironment,
          project.environments.map((environment) => ({
            flagId: flag.id,
            environmentId: environment.id,
          })),
        );
        await this.audit.record(manager, {
          projectId: project.id,
          actor,
          action: 'flag.created',
          flagKey: dto.key,
          after: {
            key: draft.key,
            name: draft.name,
            description: draft.description,
            type: draft.type,
            onValue: draft.onValue,
            offValue: draft.offValue,
            clientVisible: draft.clientVisible,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A flag with this key already exists in the project');
      }
      throw error;
    }
    this.bus.publish({ projectId: project.id, flagKey: dto.key });
    return this.get(projectKey, dto.key);
  }

  async list(projectKey: string, query: ListFlagsQuery): Promise<FlagView[]> {
    const project = await this.projects.getByKey(projectKey);
    const builder = this.flags
      .createQueryBuilder('flag')
      .leftJoinAndSelect('flag.flagEnvironments', 'state')
      .leftJoinAndSelect('state.environment', 'environment')
      .where('flag.projectId = :projectId', { projectId: project.id })
      .orderBy('flag.key', 'ASC');
    if (!query.includeArchived) {
      builder.andWhere('flag.archivedAt IS NULL');
    }
    if (query.search) {
      builder.andWhere(
        "(flag.key ILIKE :pattern ESCAPE '\\' OR flag.name ILIKE :pattern ESCAPE '\\')",
        {
          pattern: `%${escapeLike(query.search)}%`,
        },
      );
    }
    return (await builder.getMany()).map(toFlagView);
  }

  async get(projectKey: string, flagKey: string): Promise<FlagView> {
    const project = await this.projects.getByKey(projectKey);
    return toFlagView(await this.findFlag(project.id, flagKey));
  }

  /**
   * Changes metadata and archives or restores. Only fields that actually change are audited, with the old and the
   * new value. An archived flag is read-only until it is restored.
   */
  async update(
    projectKey: string,
    flagKey: string,
    dto: UpdateFlagDto,
    actor: AuthenticatedUser,
  ): Promise<FlagView> {
    const project = await this.projects.getByKey(projectKey);
    const flag = await this.findFlag(project.id, flagKey);
    const isArchived = flag.archivedAt !== null;
    const restoring = isArchived && dto.archived === false;
    if (isArchived && !restoring && Object.keys(dto).length > 0) {
      throw new ConflictException('The flag is archived; restore it first');
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of ['name', 'description', 'clientVisible'] as const) {
      if (dto[field] !== undefined && dto[field] !== flag[field]) {
        before[field] = flag[field];
        after[field] = dto[field];
      }
    }
    const archiveChanged = dto.archived !== undefined && dto.archived !== isArchived;
    if (Object.keys(after).length === 0 && !archiveChanged) {
      return toFlagView(flag);
    }

    await this.dataSource.transaction(async (manager) => {
      const changes: Partial<Flag> = { ...after };
      if (archiveChanged) {
        changes.archivedAt = dto.archived ? new Date() : null;
      }
      await manager.update(Flag, { id: flag.id }, changes);
      if (Object.keys(after).length > 0) {
        await this.audit.record(manager, {
          projectId: project.id,
          actor,
          action: 'flag.updated',
          flagKey,
          before,
          after,
        });
      }
      if (archiveChanged) {
        await this.audit.record(manager, {
          projectId: project.id,
          actor,
          action: 'flag.archived',
          flagKey,
          before: { archived: isArchived },
          after: { archived: dto.archived },
        });
      }
    });
    this.bus.publish({ projectId: project.id, flagKey });
    return this.get(projectKey, flagKey);
  }

  private async findFlag(projectId: string, key: string): Promise<Flag> {
    const flag = await this.flags.findOne({ where: { projectId, key }, relations: WITH_STATE });
    if (!flag) {
      throw new NotFoundException('Flag not found');
    }
    return flag;
  }
}
