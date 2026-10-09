import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Project } from './project.entity.js';

export const ENVIRONMENT_KEYS = ['dev', 'staging', 'prod'] as const;
export type EnvironmentKey = (typeof ENVIRONMENT_KEYS)[number];

@Entity('environments')
export class Environment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'text' })
  key!: EnvironmentKey;

  @ManyToOne(() => Project, (project) => project.environments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;
}
