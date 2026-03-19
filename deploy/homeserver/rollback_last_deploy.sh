#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
NETWORK_NAME="blog_home_default"

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

backend_container_id() {
  local backend="$1"
  compose ps -q "${backend}" | head -n 1
}

connect_backend_network() {
  local backend="$1"
  local with_active_alias="$2"
  local max_attempts=5
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    local cid
    cid="$(backend_container_id "${backend}")"
    if [[ -z "${cid}" ]]; then
      echo "container id not found: ${backend} (try ${attempt}/${max_attempts})" >&2
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    docker network disconnect "${NETWORK_NAME}" "${cid}" >/dev/null 2>&1 || true

    local args=(network connect --alias "${backend}" --alias "${backend//_/-}")
    if [[ "${with_active_alias}" == "true" ]]; then
      args+=(--alias "back_active")
    fi
    args+=("${NETWORK_NAME}" "${cid}")

    local output
    if output="$(docker "${args[@]}" 2>&1)"; then
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|No such container|is not running|already exists in network" <<< "${output}"; then
      echo "network attach retry (${backend}, try ${attempt}/${max_attempts}): ${output}" >&2
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "failed to attach ${backend} to ${NETWORK_NAME} after ${max_attempts} retries" >&2
  return 1
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

# keep caddy fixed to back_active even if backup had color-specific upstream
if [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
  tmp_file="$(mktemp)"
  sed -E "s/back[-_](blue|green|active):8080/back_active:8080/" "${SCRIPT_DIR}/Caddyfile" > "${tmp_file}"
  mv "${tmp_file}" "${SCRIPT_DIR}/Caddyfile"
fi

compose_up_with_retry db_1 redis_1 caddy cloudflared autoheal back_blue back_green
ensure_db_runtime_guards || true
reload_caddy

if [[ -f "${STATE_FILE}" ]]; then
  target_backend="$(cat "${STATE_FILE}" || true)"
  if [[ "${target_backend}" == "back_blue" || "${target_backend}" == "back_green" ]]; then
    compose_up_with_retry "${target_backend}"

    other_backend="back_blue"
    [[ "${target_backend}" == "back_blue" ]] || other_backend="back_green"

    connect_backend_network "${target_backend}" "true" || true
    connect_backend_network "${other_backend}" "false" || true

    reload_caddy

    compose stop "${other_backend}" || true
  fi
fi

compose ps
