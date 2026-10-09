import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One row per change. The table is append-only for the application database role (INSERT and SELECT only),
 * so nothing in this codebase can update or delete a row; see the audit log ADR.
 */
@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /** No foreign key on purpose: it would let a user delete rewrite history. The email keeps rows readable. */
  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ name: 'actor_email', type: 'text' })
  actorEmail!: string;

  @Column({ type: 'text' })
  action!: string;

  @Column({ name: 'flag_key', type: 'text', nullable: true })
  flagKey!: string | null;

  @Column({ name: 'environment_key', type: 'text', nullable: true })
  environmentKey!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before!: object | null;

  @Column({ type: 'jsonb', nullable: true })
  after!: object | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
