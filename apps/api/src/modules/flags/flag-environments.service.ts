import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuditAction } from '../audit/audit.types.js';
import { ENVIRONMENT_KEYS } from '../projects/entities/environment.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import type { EngageKillSwitchDto } from './dto/kill-switch.dto.js';
import { toRule } from './dto/rule.dto.js';
import type { UpdateFlagEnvironmentDto } from './dto/update-flag-environment.dto.js';
import { FlagEnvironment } from './entities/flag-environment.entity.js';
import { Flag } from './entities/flag.entity.js';
import { FlagChangeBus } from './flag-change.bus.js';
import { toFlagEnvironmentView } from './flag.view.js';
import type { FlagEnvironmentView } from './flag.view.js';

/** The columns an update can change; the same shape is used for the audit `before` and `after`. */
interface StateChange {
  enabled?: boolean;
  rolloutPercentage?: number;
  rules?: FlagEnvironment['rules'];
  killSwitch?: boolean;
  killReason?: string | null;
}

interface Target {
  projectId: string;
  flag: Flag;
  state: FlagEnvironment;
}

@Injectable()
export class FlagEnvironmentsService {
  constructor(
    @InjectRepository(Flag) private readonly flags: Repository<Flag>,
    @InjectRepository(FlagEnvironment) private readonly states: Repository<FlagEnvironment>,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
    private readonly bus: FlagChangeBus,
    private readonly dataSource: DataSource,
  ) {}

  async update(
    projectKey: string,
    flagKey: string,
    environmentKey: string,
    dto: UpdateFlagEnvironmentDto,
    actor: AuthenticatedUser,
  ): Promise<FlagEnvironmentView> {
    const target = await this.findTarget(projectKey, flagKey, environmentKey);
    const change = this.diff(target.state, {
      enabled: dto.enabled,
      rolloutPercentage: dto.rolloutPercentage,
      rules: dto.rules?.map(toRule),
    });
    if (Object.keys(change).length === 0) {
      return toFlagEnvironmentView(target.state);
    }
    return this.apply(target, dto.revision, change, 'flag.environment.updated', actor);
  }

  async engageKillSwitch(
    projectKey: string,
    flagKey: string,
    environmentKey: string,
    dto: EngageKillSwitchDto,
    actor: AuthenticatedUser,
  ): Promise<FlagEnvironmentView> {
    const target = await this.findTarget(projectKey, flagKey, environmentKey);
    if (target.state.killSwitch) {
      throw new ConflictException('The kill switch is already on');
    }
    return this.apply(
      target,
      dto.revision,
      { killSwitch: true, killReason: dto.reason },
      'flag.kill_switch.enabled',
      actor,
    );
  }

  async releaseKillSwitch(
    projectKey: string,
    flagKey: string,
    environmentKey: string,
    revision: number,
    actor: AuthenticatedUser,
  ): Promise<FlagEnvironmentView> {
    const target = await this.findTarget(projectKey, flagKey, environmentKey);
    if (!target.state.killSwitch) {
      throw new ConflictException('The kill switch is not on');
    }
    return this.apply(
      target,
      revision,
      { killSwitch: false, killReason: null },
      'flag.kill_switch.disabled',
      actor,
    );
  }

  /** Only the fields whose value really differs from the current state. */
  private diff(state: FlagEnvironment, wanted: StateChange): StateChange {
    const change: StateChange = {};
    if (wanted.enabled !== undefined && wanted.enabled !== state.enabled) {
      change.enabled = wanted.enabled;
    }
    if (
      wanted.rolloutPercentage !== undefined &&
      wanted.rolloutPercentage !== state.rolloutPercentage
    ) {
      change.rolloutPercentage = wanted.rolloutPercentage;
    }
    if (
      wanted.rules !== undefined &&
      JSON.stringify(wanted.rules) !== JSON.stringify(state.rules)
    ) {
      change.rules = wanted.rules;
    }
    return change;
  }

  /**
   * Optimistic locking: the row is updated only while its revision still equals the one the client read, and the
   * revision is bumped in the same statement. If another change got there first, no row matches and the client
   * receives 409 with the current state, so nothing is overwritten silently.
   */
  private async apply(
    target: Target,
    expectedRevision: number,
    change: StateChange,
    action: AuditAction,
    actor: AuthenticatedUser,
  ): Promise<FlagEnvironmentView> {
    const before = this.pick(target.state, change);
    const newRevision = await this.dataSource.transaction(async (manager) => {
      const updated = await manager
        .createQueryBuilder()
        .update(FlagEnvironment)
        .set({ ...change, revision: () => 'revision + 1', updatedAt: () => 'now()' })
        .where('id = :id AND revision = :revision', {
          id: target.state.id,
          revision: expectedRevision,
        })
        .returning(['revision'])
        .execute();
      const row = (updated.raw as { revision: number }[])[0];
      if (!row) {
        return undefined;
      }
      await this.audit.record(manager, {
        projectId: target.projectId,
        actor,
        action,
        flagKey: target.flag.key,
        environmentKey: target.state.environment.key,
        before,
        after: change,
      });
      return row.revision;
    });

    if (newRevision === undefined) {
      throw await this.revisionMismatch(target.state.id);
    }
    this.bus.publish({
      projectId: target.projectId,
      flagKey: target.flag.key,
      environmentKey: target.state.environment.key,
      revision: newRevision,
    });
    return toFlagEnvironmentView(await this.loadState(target.state.id));
  }

  private pick(state: FlagEnvironment, change: StateChange): StateChange {
    const before: Record<string, unknown> = {};
    for (const field of Object.keys(change) as (keyof StateChange)[]) {
      before[field] = state[field];
    }
    return before;
  }

  private async revisionMismatch(stateId: string): Promise<ConflictException> {
    const current = toFlagEnvironmentView(await this.loadState(stateId));
    return new ConflictException({
      code: 'REVISION_MISMATCH',
      message:
        'Someone else changed this flag environment first. Review the current state and try again.',
      current,
    });
  }

  private loadState(id: string): Promise<FlagEnvironment> {
    return this.states.findOneOrFail({ where: { id }, relations: { environment: true } });
  }

  private async findTarget(
    projectKey: string,
    flagKey: string,
    environmentKey: string,
  ): Promise<Target> {
    const project = await this.projects.getByKey(projectKey);
    if (!ENVIRONMENT_KEYS.includes(environmentKey as (typeof ENVIRONMENT_KEYS)[number])) {
      throw new NotFoundException('Environment not found');
    }
    const flag = await this.flags.findOne({ where: { projectId: project.id, key: flagKey } });
    if (!flag) {
      throw new NotFoundException('Flag not found');
    }
    if (flag.archivedAt) {
      throw new ConflictException('The flag is archived; restore it first');
    }
    const state = await this.states.findOne({
      where: {
        flagId: flag.id,
        environment: { key: environmentKey as (typeof ENVIRONMENT_KEYS)[number] },
      },
      relations: { environment: true },
    });
    if (!state) {
      throw new NotFoundException('Environment not found');
    }
    return { projectId: project.id, flag, state };
  }
}
