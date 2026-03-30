#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
STATE_FILE="${SCRIPT_DIR}/.active_backend"

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

mkdir -p "${BACKUP_DIR}"

if [[ -d "${SCRIPT_DIR}/caddy" ]]; then
  cp -R "${SCRIPT_DIR}/caddy" "${BACKUP_DIR}/caddy"
elif [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
  # legacy fallback for older layout
  mkdir -p "${BACKUP_DIR}/caddy"
  cp "${SCRIPT_DIR}/Caddyfile" "${BACKUP_DIR}/caddy/Caddyfile"
fi

for file in .env.prod docker-compose.prod.yml .active_backend; do
  if [[ -f "${SCRIPT_DIR}/${file}" ]]; then
    cp "${SCRIPT_DIR}/${file}" "${BACKUP_DIR}/${file}"
  fi
done

active_backend=""
active_backend_image=""
if [[ -f "${STATE_FILE}" ]]; then
  active_backend="$(cat "${STATE_FILE}" || true)"
  if [[ "${active_backend}" == "back_blue" || "${active_backend}" == "back_green" ]]; then
    active_backend_image="$(container_image_for_service "${active_backend}" || true)"
  fi
fi

{
  echo "created_at=${TIMESTAMP}"
  echo "git_head=$(git -C "${SCRIPT_DIR}/../.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
  if [[ -n "${active_backend}" ]]; then
    echo "active_backend=${active_backend}"
  fi
  if [[ -n "${active_backend_image}" ]]; then
    echo "active_backend_image=${active_backend_image}"
  fi
} > "${BACKUP_DIR}/metadata.env"

echo "${BACKUP_DIR}"
