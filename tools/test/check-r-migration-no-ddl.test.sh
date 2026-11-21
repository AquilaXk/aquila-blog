#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
guard="${repo_root}/tools/guards/check-r-migration-no-ddl.sh"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

migration_dir="${tmpdir}/back/src/main/resources/db/migration"
mkdir -p "${migration_dir}"

run_guard() {
  REPO_ROOT="${tmpdir}" bash "${guard}"
}

pass_file="${migration_dir}/R__operational_indexes.sql"
cat >"${pass_file}" <<'SQL'
-- Operational indexes live in versioned migrations.
-- This repeatable migration intentionally contains no DDL.
SQL

if ! run_guard >/dev/null; then
  echo "expected clean R__ to pass" >&2
  exit 1
fi

fail_file="${migration_dir}/R__bad_ddl.sql"
cat >"${fail_file}" <<'SQL'
ALTER TABLE IF EXISTS public.post
    ADD COLUMN IF NOT EXISTS content_html TEXT;
SQL

if run_guard >/dev/null 2>&1; then
  echo "expected R__ with ALTER TABLE / ADD COLUMN to fail" >&2
  exit 1
fi

rm -f "${fail_file}"
cat >"${migration_dir}/R__drop_table.sql" <<'SQL'
DROP TABLE IF EXISTS public.scratch;
SQL

if run_guard >/dev/null 2>&1; then
  echo "expected R__ with DROP TABLE to fail" >&2
  exit 1
fi

echo "check-r-migration-no-ddl.test.sh passed"
