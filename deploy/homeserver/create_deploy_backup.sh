#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
BASELINE_DIR="${SCRIPT_DIR}/.deploy-baseline"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
RELEASE_STATE_FILE="${SCRIPT_DIR}/.backend-release-state.env"

read_key_from_file() {
  local key="$1"
  local file="$2"
  [[ -f "${file}" ]] || return 0
  awk -F= -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      gsub(/^'\''/, "", value)
      gsub(/'\''$/, "", value)
      print value
    }
  ' "${file}" | tail -n 1
}

is_digest_image_value() {
  [[ "$1" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]
}

container_image_for_service() {
  local service="$1"
  local container_id
  container_id="$(
    docker ps -aq \
      --filter "label=com.docker.compose.project=blog_home" \
      --filter "label=com.docker.compose.service=${service}" 2>/dev/null | head -n 1 || true
  )"
  if [[ -z "${container_id}" ]]; then
    return 0
  fi

  docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

is_canonical_flyway_schema_version() {
  [[ "$1" =~ ^[1-9][0-9]*(\.[0-9]+)*$ ]]
}

resolve_prod_db_name() {
  local db_name
  db_name="$(read_key_from_file "custom.prod.dbName" "${ENV_FILE}")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi
  db_name="$(read_key_from_file "CUSTOM_PROD_DBNAME" "${ENV_FILE}")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi
  local db_base_name
  db_base_name="$(read_key_from_file "DB_BASE_NAME" "${ENV_FILE}")"
  echo "${db_base_name:-blog}_prod"
}

query_flyway_schema_version() {
  local db_name version
  db_name="$(resolve_prod_db_name)"
  if ! version="$(
    docker compose --env-file "${ENV_FILE}" -f "${SCRIPT_DIR}/docker-compose.prod.yml" \
      exec -T db_1 psql -U postgres -d "${db_name}" -At -v ON_ERROR_STOP=1 \
      -c "SELECT version FROM flyway_schema_history WHERE success = true AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1" \
      2>/dev/null | tr -d '\r' | tail -n 1
  )"; then
    echo "unavailable"
    return
  fi
  if ! is_canonical_flyway_schema_version "${version}"; then
    echo "unavailable"
    return
  fi
  echo "${version}"
}

mkdir -p "${BACKUP_DIR}"

# The restorable file set must describe the last deploy that passed every post-deploy
# check, not whatever the previous run happened to leave behind: a failed deploy rolls
# back and rewrites caddy/Caddyfile in place (rollback_last_deploy.sh normalizes the
# upstream token and re-points it at the surviving backend), so the working tree after a
# failed run is not the last successful deploy. Prefer the baseline recorded by
# record_deploy_baseline.sh and fall back to the working tree only when no baseline
# exists yet, which must stay visible in the deploy log.
# The gate checks caddy/Caddyfile rather than the caddy directory: an empty caddy/ would
# pass a directory test and produce a backup that restores no reverse-proxy config at all.
restore_source="worktree"
if [[ -f "${BASELINE_DIR}/docker-compose.prod.yml" && -f "${BASELINE_DIR}/caddy/Caddyfile" ]]; then
  restore_source="baseline"
else
  echo "deploy backup: no successful-deploy baseline at ${BASELINE_DIR}; falling back to server working tree files" >&2
fi

if [[ "${restore_source}" == "baseline" ]]; then
  cp "${BASELINE_DIR}/docker-compose.prod.yml" "${BACKUP_DIR}/docker-compose.prod.yml"
  cp -R "${BASELINE_DIR}/caddy" "${BACKUP_DIR}/caddy"
else
  if [[ -d "${SCRIPT_DIR}/caddy" ]]; then
    cp -R "${SCRIPT_DIR}/caddy" "${BACKUP_DIR}/caddy"
  elif [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
    # legacy fallback for older layout
    mkdir -p "${BACKUP_DIR}/caddy"
    cp "${SCRIPT_DIR}/Caddyfile" "${BACKUP_DIR}/caddy/Caddyfile"
  fi

  if [[ -f "${SCRIPT_DIR}/docker-compose.prod.yml" ]]; then
    cp "${SCRIPT_DIR}/docker-compose.prod.yml" "${BACKUP_DIR}/docker-compose.prod.yml"
  fi
fi

# .active_backend is live runtime state (which colour currently serves traffic), not
# deployed configuration, so it always comes from the server working tree.
if [[ -f "${STATE_FILE}" ]]; then
  cp "${STATE_FILE}" "${BACKUP_DIR}/.active_backend"
fi

active_backend=""
active_backend_image=""
back_blue_image=""
back_green_image=""
back_read_image=""
back_admin_image=""
back_worker_image=""
if [[ -f "${STATE_FILE}" ]]; then
  active_backend="$(cat "${STATE_FILE}" || true)"
  if [[ "${active_backend}" == "back_blue" || "${active_backend}" == "back_green" ]]; then
    active_backend_image="$(container_image_for_service "${active_backend}" || true)"
  fi
fi
back_blue_image="$(container_image_for_service "back_blue" || true)"
back_green_image="$(container_image_for_service "back_green" || true)"
back_read_image="$(container_image_for_service "back_read" || true)"
back_admin_image="$(container_image_for_service "back_admin" || true)"
back_worker_image="$(container_image_for_service "back_worker" || true)"
flyway_schema_version="$(query_flyway_schema_version)"
if [[ "${flyway_schema_version}" == "unavailable" ]]; then
  echo "deploy backup: Flyway schema version unavailable; worker rollback will preserve current image" >&2
fi
compose_image_keys=(AUTOHEAL_IMAGE DOCKER_SOCKET_PROXY_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE UPTIME_KUMA_IMAGE PROMETHEUS_IMAGE ALERTMANAGER_IMAGE POSTGRES_EXPORTER_IMAGE GRAFANA_IMAGE LOKI_IMAGE PROMTAIL_IMAGE NODE_RUNTIME_IMAGE DB_IMAGE REDIS_IMAGE MINIO_IMAGE)

{
  echo "created_at=${TIMESTAMP}"
  echo "manifest_version=4"
  echo "secret_files_copied=false"
  echo "flyway_schema_version=${flyway_schema_version}"
  echo "git_head=$(git -C "${SCRIPT_DIR}/../.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
  # git_head is the commit currently checked out on the server, which after a failed
  # deploy is the commit that failed. restore_source/baseline_* describe the commit the
  # restorable files actually came from.
  echo "restore_source=${restore_source}"
  if [[ "${restore_source}" == "baseline" ]]; then
    echo "baseline_deploy_sha=$(read_key_from_file "deploy_sha" "${BASELINE_DIR}/metadata.env")"
    echo "baseline_created_at=$(read_key_from_file "created_at" "${BASELINE_DIR}/metadata.env")"
  fi
  if [[ -f "${RELEASE_STATE_FILE}" ]]; then
    echo "release_state_present=true"
  fi
  if [[ -n "${active_backend}" ]]; then
    echo "active_backend=${active_backend}"
  fi
  if [[ -n "${active_backend_image}" ]]; then
    echo "active_backend_image=${active_backend_image}"
  fi
  if [[ -n "${back_blue_image}" ]]; then
    echo "back_blue_image=${back_blue_image}"
  fi
  if [[ -n "${back_green_image}" ]]; then
    echo "back_green_image=${back_green_image}"
  fi
  if [[ -n "${back_read_image}" ]]; then
    echo "back_read_image=${back_read_image}"
  fi
  if [[ -n "${back_admin_image}" ]]; then
    echo "back_admin_image=${back_admin_image}"
  fi
  if [[ -n "${back_worker_image}" ]]; then
    echo "back_worker_image=${back_worker_image}"
  fi
  for image_key in "${compose_image_keys[@]}"; do
    image_value="$(read_key_from_file "${image_key}" "${ENV_FILE}")"
    if [[ -n "${image_value}" ]] && is_digest_image_value "${image_value}"; then
      echo "${image_key}=${image_value}"
    fi
  done
} > "${BACKUP_DIR}/metadata.env"

echo "${BACKUP_DIR}"
