-- Prepares one database for Flagboard. Run as a superuser, once per database (the roles are created only if
-- they do not exist yet, so it can be run again for a second database such as the e2e one).
--
--   flagboard_migrator  owns the schema and is the only role that runs migrations (DDL).
--   flagboard_app       is what the API connects as: data access only, no DDL.
--
-- psql variables: migrator_password, app_password, dbname. Used by the Docker Compose init script and by CI:
--   psql -v ON_ERROR_STOP=1 -v dbname=... -v migrator_password=... -v app_password=... -f init-roles.sql

SELECT 'CREATE ROLE flagboard_migrator LOGIN PASSWORD ' || quote_literal(:'migrator_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'flagboard_migrator')
\gexec

SELECT 'CREATE ROLE flagboard_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '
  || quote_literal(:'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'flagboard_app')
\gexec

REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO flagboard_migrator, flagboard_app;

-- The migrator owns the schema, so it can create objects and the application role cannot.
ALTER SCHEMA public OWNER TO flagboard_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO flagboard_app;

-- Every table the migrator creates from now on gives the application role data access only. Individual
-- migrations narrow this further (audit_events is insert and select only).
ALTER DEFAULT PRIVILEGES FOR ROLE flagboard_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flagboard_app;
