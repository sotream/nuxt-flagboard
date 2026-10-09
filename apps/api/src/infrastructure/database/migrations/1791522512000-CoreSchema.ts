import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The whole core schema. Written by hand so the constraints (checks, uniqueness, foreign keys) and the grants
 * are explicit and reviewable in one place. Run as the migrator role; the application role gets data access
 * through the default privileges set up in infra/postgres/init-roles.sql, narrowed at the end of this file.
 */
export class CoreSchema1791522512000 implements MigrationInterface {
  name = 'CoreSchema1791522512000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE CHECK (email = lower(email)),
        password_hash text NOT NULL,
        role text NOT NULL CHECK (role IN ('admin', 'viewer')),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        family_id uuid NOT NULL,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query('CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id)');
    await queryRunner.query(
      'CREATE INDEX ix_refresh_tokens_family_id ON refresh_tokens (family_id)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_refresh_tokens_expires_at ON refresh_tokens (expires_at)',
    );

    await queryRunner.query(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(key) <= 64),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE environments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        key text NOT NULL CHECK (key IN ('dev', 'staging', 'prod')),
        UNIQUE (project_id, key)
      )`);

    await queryRunner.query(`
      CREATE TABLE api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        environment_id uuid NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
        kind text NOT NULL CHECK (kind IN ('server', 'client')),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        prefix text NOT NULL,
        key_hash text NOT NULL UNIQUE,
        created_by uuid REFERENCES users (id) ON DELETE SET NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query('CREATE INDEX ix_api_keys_environment_id ON api_keys (environment_id)');

    await queryRunner.query(`
      CREATE TABLE flags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
        key text NOT NULL CHECK (key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' AND length(key) <= 64),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
        type text NOT NULL CHECK (type IN ('boolean', 'string')),
        on_value text NOT NULL CHECK (length(on_value) <= 256),
        off_value text NOT NULL CHECK (length(off_value) <= 256),
        salt text NOT NULL CHECK (salt ~ '^[0-9a-f]{32}$'),
        client_visible boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_id, key),
        CONSTRAINT ck_flags_boolean_values CHECK (
          type <> 'boolean' OR (on_value IN ('true', 'false') AND off_value IN ('true', 'false'))
        )
      )`);

    await queryRunner.query(`
      CREATE TABLE flag_environments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        flag_id uuid NOT NULL REFERENCES flags (id) ON DELETE CASCADE,
        environment_id uuid NOT NULL REFERENCES environments (id) ON DELETE CASCADE,
        enabled boolean NOT NULL DEFAULT false,
        rollout_percentage integer NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
        rules jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(rules) = 'array'),
        kill_switch boolean NOT NULL DEFAULT false,
        kill_reason text CHECK (length(kill_reason) <= 500),
        revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (flag_id, environment_id),
        CONSTRAINT ck_flag_environments_kill_reason CHECK (NOT kill_switch OR kill_reason IS NOT NULL)
      )`);
    await queryRunner.query(
      'CREATE INDEX ix_flag_environments_environment_id ON flag_environments (environment_id)',
    );

    // No foreign key on actor_id and none that cascades: a foreign key action would run as the table owner
    // and could rewrite or delete history. actor_email keeps the record readable after a user is removed.
    await queryRunner.query(`
      CREATE TABLE audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id uuid NOT NULL REFERENCES projects (id) ON DELETE RESTRICT,
        actor_id uuid NOT NULL,
        actor_email text NOT NULL,
        action text NOT NULL,
        flag_key text,
        environment_key text,
        before jsonb,
        after jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      'CREATE INDEX ix_audit_events_project_created ON audit_events (project_id, created_at DESC, id DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_audit_events_project_flag ON audit_events (project_id, flag_key, created_at DESC)',
    );

    // Append-only: the application role may add and read audit rows but never change or remove them.
    await queryRunner.query('REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM flagboard_app');
    // The application never reads TypeORM's migration history.
    await queryRunner.query('REVOKE ALL ON TABLE migrations FROM flagboard_app');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'audit_events',
      'flag_environments',
      'flags',
      'api_keys',
      'environments',
      'projects',
      'refresh_tokens',
      'users',
    ]) {
      await queryRunner.query(`DROP TABLE ${table}`);
    }
  }
}
