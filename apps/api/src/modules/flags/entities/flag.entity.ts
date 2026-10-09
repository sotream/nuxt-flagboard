import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { FlagType } from '../flag-values.js';
import { FlagEnvironment } from './flag-environment.entity.js';

@Entity('flags')
export class Flag {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'text' })
  type!: FlagType;

  /** Stored as text, read by `type`; boolean flags hold 'true' or 'false'. */
  @Column({ name: 'on_value', type: 'text' })
  onValue!: string;

  @Column({ name: 'off_value', type: 'text' })
  offValue!: string;

  /** Random and immutable. Makes rollout cohorts differ between flags. Never returned by the admin API. */
  @Column({ type: 'text' })
  salt!: string;

  /** Client keys only see and evaluate flags where this is true. */
  @Column({ name: 'client_visible', type: 'boolean', default: false })
  clientVisible!: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => FlagEnvironment, (flagEnvironment) => flagEnvironment.flag)
  flagEnvironments!: FlagEnvironment[];
}
