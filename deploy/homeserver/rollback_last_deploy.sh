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
  local cid
  cid="$(backend_container_id "${backend}")"
  if [[ -z "${cid}" ]]; then
    echo "container id not found: ${backend}" >&2
    return 1
  fi

  docker network disconnect "${NETWORK_NAME}" "${cid}" >/dev/null 2>&1 || true

  local args=(network connect --alias "${backend}" --alias "${backend//_/-}")
  if [[ "${with_active_alias}" == "true" ]]; then
    args+=(--alias "back_active")
  fi
  args+=("${NETWORK_NAME}" "${cid}")

  docker "${args[@]}"
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

compose up -d db_1 redis_1 caddy cloudflared back_blue back_green
reload_caddy

if [[ -f "${STATE_FILE}" ]]; then
  target_backend="$(cat "${STATE_FILE}" || true)"
  if [[ "${target_backend}" == "back_blue" || "${target_backend}" == "back_green" ]]; then
    compose up -d "${target_backend}"

    other_backend="back_blue"
    [[ "${target_backend}" == "back_blue" ]] || other_backend="back_green"

    connect_backend_network "${target_backend}" "true" || true
    connect_backend_network "${other_backend}" "false" || true

    reload_caddy

    compose stop "${other_backend}" || true
  fi
fi

compose ps
