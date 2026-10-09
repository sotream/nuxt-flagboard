import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Environment } from '../../projects/entities/environment.entity.js';
import type { ApiKeyKind } from '../api-key.js';

/** Only the SHA-256 of the key is stored. The plaintext exists only in the response to its creation. */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'environment_id', type: 'uuid' })
  environmentId!: string;

  @Column({ type: 'text' })
  kind!: ApiKeyKind;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  prefix!: string;

  @Column({ name: 'key_hash', type: 'text', unique: true })
  keyHash!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => Environment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'environment_id' })
  environment!: Relation<Environment>;
}
