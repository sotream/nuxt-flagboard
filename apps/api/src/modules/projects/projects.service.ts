import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/utils/db-errors.js';
import { escapeLike } from '../../common/utils/like.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { Environment, ENVIRONMENT_KEYS } from './entities/environment.entity.js';
import { Project } from './entities/project.entity.js';

const MAX_PROJECTS = 200;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Creates a project with its three fixed environments and its audit event, in one transaction. */
  async create(key: string, name: string, actor: AuthenticatedUser): Promise<Project> {
    try {
      const id = await this.dataSource.transaction(async (manager) => {
        const project = await manager.save(Project, { key, name });
        await manager.insert(
          Environment,
          ENVIRONMENT_KEYS.map((environmentKey) => ({
            projectId: project.id,
            key: environmentKey,
          })),
        );
        await this.audit.record(manager, {
          projectId: project.id,
          actor,
          action: 'project.created',
          after: { key, name },
        });
        return project.id;
      });
      return await this.getById(id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A project with this key already exists');
      }
      throw error;
    }
  }

  list(search?: string): Promise<Project[]> {
    const query = this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.environments', 'environment')
      .orderBy('project.name', 'ASC')
      .take(MAX_PROJECTS);
    if (search) {
      query.where(
        "(project.key ILIKE :pattern ESCAPE '\\' OR project.name ILIKE :pattern ESCAPE '\\')",
        { pattern: `%${escapeLike(search)}%` },
      );
    }
    return query.getMany().then((found) => found.map(withSortedEnvironments));
  }

  async getByKey(key: string): Promise<Project> {
    const project = await this.projects.findOne({
      where: { key },
      relations: { environments: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return withSortedEnvironments(project);
  }

  private async getById(id: string): Promise<Project> {
    const project = await this.projects.findOneOrFail({
      where: { id },
      relations: { environments: true },
    });
    return withSortedEnvironments(project);
  }
}

/** Environments always come back in the order dev, staging, prod. */
function withSortedEnvironments(project: Project): Project {
  project.environments.sort(
    (a, b) => ENVIRONMENT_KEYS.indexOf(a.key) - ENVIRONMENT_KEYS.indexOf(b.key),
  );
  return project;
}
