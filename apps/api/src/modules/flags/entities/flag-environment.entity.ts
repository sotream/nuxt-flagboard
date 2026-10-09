import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Rule } from '@flagboard/core';
import { Environment } from '../../projects/entities/environment.entity.js';
import { Flag } from './flag.entity.js';

/** The state of one flag in one environment. `revision` is for optimistic locking only. */
@Entity('flag_environments')
export class FlagEnvironment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'flag_id', type: 'uuid' })
  flagId!: string;

  @Column({ name: 'environment_id', type: 'uuid' })
  environmentId!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ name: 'rollout_percentage', type: 'integer', default: 0 })
  rolloutPercentage!: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rules!: Rule[];

  @Column({ name: 'kill_switch', type: 'boolean', default: false })
  killSwitch!: boolean;

  @Column({ name: 'kill_reason', type: 'text', nullable: true })
  killReason!: string | null;

  @Column({ type: 'integer', default: 1 })
  revision!: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @ManyToOne(() => Flag, (flag) => flag.flagEnvironments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flag_id' })
  flag!: Flag;

  @ManyToOne(() => Environment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'environment_id' })
  environment!: Environment;
}
