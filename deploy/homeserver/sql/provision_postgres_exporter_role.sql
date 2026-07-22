-- Provision postgres_exporter monitoring role (pg_monitor, never superuser).
-- Invoked by blue_green_deploy.sh with psql -v bindings:
--   exporter_user, exporter_password
-- Connect as postgres superuser to the postgres maintenance DB.

SELECT set_config('app.exporter_user', :'exporter_user', false);
SELECT set_config('app.exporter_password', :'exporter_password', false);

DO $$
DECLARE
  exporter_user text := current_setting('app.exporter_user');
  exporter_password text := current_setting('app.exporter_password');
BEGIN
  IF exporter_user = 'postgres' THEN
    RAISE EXCEPTION 'exporter user must not be postgres';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = exporter_user) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', exporter_user, exporter_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', exporter_user, exporter_password);
  END IF;

  EXECUTE format(
    'ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    exporter_user
  );
  EXECUTE format('GRANT pg_monitor TO %I', exporter_user);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), exporter_user);
END $$;
