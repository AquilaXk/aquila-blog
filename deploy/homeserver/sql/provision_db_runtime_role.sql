-- Provision app runtime + Flyway migration roles (never superuser).
-- Invoked by blue_green_deploy.sh with psql -v bindings:
--   runtime_user, runtime_password, migration_user, migration_password
-- Connect as postgres superuser to the production app DB.

-- Keep plaintext passwords out of the server statement log regardless of host config.
SET log_statement = 'none';
SET log_min_duration_statement = -1;

-- Terse errors drop the CONTEXT/"SQL statement" lines that would echo PASSWORD literals to stderr.
\set VERBOSITY terse

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
  obj record;
BEGIN
  IF runtime_user = 'postgres' OR migration_user = 'postgres' THEN
    RAISE EXCEPTION 'runtime/migration user must not be postgres';
  END IF;

  -- Re-raise without the failing statement so PASSWORD literals never reach the client.
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_user) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', runtime_user, runtime_password);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', runtime_user, runtime_password);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'runtime role password bootstrap failed for %: %', runtime_user, SQLERRM;
  END;

  EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', runtime_user);
  EXECUTE format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', current_database(), runtime_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', runtime_user);
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', runtime_user);

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migration_user) THEN
      EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', migration_user, migration_password);
    ELSE
      EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', migration_user, migration_password);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'migration role password bootstrap failed for %: %', migration_user, SQLERRM;
  END;

  EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', migration_user);
  EXECUTE format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', current_database(), migration_user);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', migration_user);
  -- Existing DB cutover: Flyway needs DML/DDL on current public objects (not only CREATE).
  EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I', migration_user);
  EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I', migration_user);

  -- Transfer postgres-owned public relations so Flyway can ALTER/INDEX without superuser.
  -- Serial/identity-linked sequences reject a direct ALTER SEQUENCE ... OWNER TO; they inherit
  -- the new owner from ALTER TABLE on their owning table, so skipping them keeps the loop complete.
  FOR obj IN
    SELECT c.relname AS relname, c.relkind AS relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
      AND pg_get_userbyid(c.relowner) = 'postgres'
      AND NOT (c.relkind = 'S' AND EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.refclassid = 'pg_class'::regclass
          AND d.deptype IN ('a', 'i')
      ))
  LOOP
    IF obj.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', obj.relname, migration_user);
    ELSE
      EXECUTE format('ALTER TABLE public.%I OWNER TO %I', obj.relname, migration_user);
    END IF;
  END LOOP;

  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', migration_user, runtime_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', migration_user, runtime_user);
END $$;
