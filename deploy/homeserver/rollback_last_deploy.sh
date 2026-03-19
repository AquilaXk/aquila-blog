#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
STATE_FILE="${SCRIPT_DIR}/.active_backend"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

compose_up_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d "$@" 2>&1)"; then
      echo "${output}"
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {print substr($0, index($0, "=") + 1); exit}' "${ENV_FILE}"
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "${value}"
}

resolve_prod_db_name() {
  local db_name

  db_name="$(trim_quotes "$(env_value "custom.prod.dbName")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  db_name="$(trim_quotes "$(env_value "CUSTOM_PROD_DBNAME")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  local db_base_name
  db_base_name="$(trim_quotes "$(env_value "DB_BASE_NAME")")"
  if [[ -z "${db_base_name}" ]]; then
    db_base_name="blog"
  fi
  echo "${db_base_name}_prod"
}

ensure_db_runtime_guards() {
  local db_name
  db_name="$(resolve_prod_db_name)"

  local guard_sql
  guard_sql=$'
ALTER TABLE IF EXISTS public.post ADD COLUMN IF NOT EXISTS content_html TEXT;

DO $$
BEGIN
  IF to_regclass('"'"'public.post_like'"'"') IS NOT NULL AND to_regclass('"'"'public.post_like_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_like_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_like), 1), false);
  END IF;
  IF to_regclass('"'"'public.post_attr'"'"') IS NOT NULL AND to_regclass('"'"'public.post_attr_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_attr_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_attr), 1), false);
  END IF;
  IF to_regclass('"'"'public.post_comment'"'"') IS NOT NULL AND to_regclass('"'"'public.post_comment_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_comment_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_comment), 1), false);
  END IF;
  IF to_regclass('"'"'public.member_attr'"'"') IS NOT NULL AND to_regclass('"'"'public.member_attr_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.member_attr_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.member_attr), 1), false);
  END IF;
  IF to_regclass('"'"'public.task'"'"') IS NOT NULL AND to_regclass('"'"'public.task_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.task_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.task), 1), false);
  END IF;
END $$;
'

  if compose exec -T db_1 psql -U postgres -d "${db_name}" -v ON_ERROR_STOP=1 -c "${guard_sql}" >/dev/null 2>&1; then
    echo "schema/sequence guard ok in ${db_name}"
    return 0
  fi

  echo "schema/sequence guard warning: failed in ${db_name}; continuing rollback" >&2
  return 1
}

reload_caddy() {
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
}

latest_backup() {
  ls -1dt "${BACKUP_ROOT}"/* 2>/dev/null | head -n 1
}

backend_http_host() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back-blue"
    return
  fi
  echo "back-green"
}

set_caddy_upstream_backend() {
  local backend="$1"
  local host
  host="$(backend_http_host "${backend}")"
  local rewritten
  rewritten="$(sed -E "s/back[-_](blue|green|active):8080/${host}:8080/g" "${SCRIPT_DIR}/Caddyfile")"
  printf '%s\n' "${rewritten}" > "${SCRIPT_DIR}/Caddyfile"
  reload_caddy
  echo "rollback caddy upstream -> ${host}:8080"
}

BACKUP_DIR="${1:-$(latest_backup)}"

if [[ -z "${BACKUP_DIR:-}" || ! -d "${BACKUP_DIR}" ]]; then
  echo "no backup directory found" >&2
  exit 1
fi

echo "rollback from backup: ${BACKUP_DIR}"

for file in Caddyfile .env.prod docker-compose.prod.yml .active_backend; do
  if [[ -f "${BACKUP_DIR}/${file}" ]]; then
    cp "${BACKUP_DIR}/${file}" "${SCRIPT_DIR}/${file}"
  fi
done

# normalize legacy upstream tokens before rollback target is chosen
if [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
  normalized="$(sed -E "s/back[-_](blue|green|active):8080/back-blue:8080/g" "${SCRIPT_DIR}/Caddyfile")"
  printf '%s\n' "${normalized}" > "${SCRIPT_DIR}/Caddyfile"
fi

compose_up_with_retry db_1 redis_1 caddy cloudflared autoheal back_blue back_green
ensure_db_runtime_guards || true
reload_caddy

if [[ -f "${STATE_FILE}" ]]; then
  target_backend="$(cat "${STATE_FILE}" || true)"
  if [[ "${target_backend}" == "back_blue" || "${target_backend}" == "back_green" ]]; then
    compose_up_with_retry "${target_backend}"
    set_caddy_upstream_backend "${target_backend}"

    other_backend="back_blue"
    [[ "${target_backend}" == "back_blue" ]] || other_backend="back_green"

    compose stop "${other_backend}" || true
  fi
fi

compose ps
