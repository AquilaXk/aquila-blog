#!/usr/bin/env bash
set -euo pipefail

repo_root="${REPO_ROOT:-$(git rev-parse --show-toplevel)}"
migration_dir="${repo_root}/back/src/main/resources/db/migration"

shopt -s nullglob
files=("${migration_dir}"/R__*.sql)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "[guard] no R__*.sql files under ${migration_dir}"
  exit 0
fi

# Minimum DDL keywords banned from repeatable migrations (issue #1132).
pattern='ALTER[[:space:]]+TABLE|ADD[[:space:]]+COLUMN|DROP[[:space:]]+TABLE'
violations=0

for file in "${files[@]}"; do
  # Strip line comments before scanning to avoid false positives in documentation.
  matches="$(sed -E 's/--.*$//' "${file}" | grep -Ein "${pattern}" || true)"
  if [[ -n "${matches}" ]]; then
    echo "[guard] DDL keyword detected in repeatable migration: ${file#"${repo_root}/"}" >&2
    echo "${matches}" >&2
    violations=1
  fi
done

if [[ "${violations}" -ne 0 ]]; then
  echo >&2
  echo "R__*.sql must not contain DDL (ALTER TABLE / ADD COLUMN / DROP TABLE)." >&2
  echo "Move schema changes to versioned migrations (VYYYYMMDD_NN__*.sql)." >&2
  exit 1
fi

echo "[guard] R__*.sql DDL check passed (${#files[@]} file(s))"
