-- Provision app runtime + Flyway migration roles (never superuser).
-- Invoked by blue_green_deploy.sh with psql -v bindings:
--   runtime_user, runtime_password, migration_user, migration_password
-- Connect as postgres superuser to the production app DB.

SELECT set_config('app.runtime_user', :'runtime_user', false);
SELECT set_config('app.runtime_password', :'runtime_password', false);
SELECT set_config('app.migration_user', :'migration_user', false);
SELECT set_config('app.migration_password', :'migration_password', false);

DO $$
DECLARE
  runtime_user text := current_setting('app.runtime_user');
  runtime_password text := current_setting('app.runtime_password');
  migration_user text := current_setting('app.migration_user');
  migration_password text := current_setting('app.migration_password');
BEGIN
  IF runtime_user = 'postgres' OR migration_user = 'postgres' THEN
    RAISE EXCEPTION 'runtime/migration user must not be postgres';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_user) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', runtime_user, runtime_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', runtime_user, runtime_password);
  END IF;

  EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', runtime_user);
  EXECUTE format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', current_database(), runtime_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', runtime_user);
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', runtime_user);

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migration_user) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', migration_user, migration_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', migration_user, migration_password);
  END IF;

  EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', migration_user);
  EXECUTE format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', current_database(), migration_user);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', migration_user);

  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', migration_user, runtime_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', migration_user, runtime_user);
END $$;
