import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Project } from '../projects/entities/project.entity.js';
import type { AuditInput } from './audit.types.js';
import { DEFAULT_AUDIT_PAGE_SIZE } from './dto/list-audit.query.js';
import type { ListAuditQuery } from './dto/list-audit.query.js';
import { AuditEvent } from './entities/audit-event.entity.js';

export interface AuditEventView {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  flagKey: string | null;
  environmentKey: string | null;
  before: object | null;
  after: object | null;
  createdAt: Date;
}

export interface AuditPage {
  items: AuditEventView[];
  /** Pass as `cursor` to get the next page; null on the last page. */
  nextCursor: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Writes one event using the caller's transaction manager, so the change and its audit row commit or roll back
   * together. There is deliberately no way to record an event outside a transaction.
   */
  async record(manager: EntityManager, input: AuditInput): Promise<void> {
    await manager.insert(AuditEvent, {
      projectId: input.projectId,
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      action: input.action,
      flagKey: input.flagKey ?? null,
      environmentKey: input.environmentKey ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    });
  }

  /** Newest first. Pagination is keyset-based on `(created_at, id)`, so rows added meanwhile cannot shift pages. */
  async list(projectKey: string, query: ListAuditQuery): Promise<AuditPage> {
    const project = await this.projects.findOne({ where: { key: projectKey } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    const limit = query.limit ?? DEFAULT_AUDIT_PAGE_SIZE;
    const params: unknown[] = [project.id];
    const conditions = ['project_id = $1'];

    if (query.flagKey) {
      params.push(query.flagKey);
      conditions.push(`flag_key = $${params.length}`);
    }
    if (query.cursor) {
      await this.assertCursorBelongsTo(project.id, query.cursor);
      params.push(query.cursor);
      // The subselect keeps the full microsecond timestamp, which a JavaScript Date would round.
      conditions.push(
        `(created_at, id) < (SELECT created_at, id FROM audit_events WHERE id = $${params.length})`,
      );
    }
    params.push(limit + 1);

    const rows = await this.dataSource.query<AuditRow[]>(
      `SELECT id, action, actor_id, actor_email, flag_key, environment_key, before, after, created_at
       FROM audit_events
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );
    const page = rows.slice(0, limit);
    return {
      items: page.map(toView),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  private async assertCursorBelongsTo(projectId: string, cursor: string): Promise<void> {
    const found = await this.dataSource.query<unknown[]>(
      'SELECT 1 FROM audit_events WHERE id = $1 AND project_id = $2',
      [cursor, projectId],
    );
    if (found.length === 0) {
      throw new BadRequestException('Invalid cursor');
    }
  }
}

interface AuditRow {
  id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  flag_key: string | null;
  environment_key: string | null;
  before: object | null;
  after: object | null;
  created_at: Date;
}

const toView = (row: AuditRow): AuditEventView => ({
  id: row.id,
  action: row.action,
  actorId: row.actor_id,
  actorEmail: row.actor_email,
  flagKey: row.flag_key,
  environmentKey: row.environment_key,
  before: row.before,
  after: row.after,
  createdAt: row.created_at,
});
