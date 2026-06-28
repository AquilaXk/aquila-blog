#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
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

mkdir -p "${BACKUP_DIR}"

if [[ -d "${SCRIPT_DIR}/caddy" ]]; then
  cp -R "${SCRIPT_DIR}/caddy" "${BACKUP_DIR}/caddy"
elif [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
  # legacy fallback for older layout
  mkdir -p "${BACKUP_DIR}/caddy"
  cp "${SCRIPT_DIR}/Caddyfile" "${BACKUP_DIR}/caddy/Caddyfile"
fi

for file in docker-compose.prod.yml .active_backend; do
  if [[ -f "${SCRIPT_DIR}/${file}" ]]; then
    cp "${SCRIPT_DIR}/${file}" "${BACKUP_DIR}/${file}"
  fi
done

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
compose_image_keys=(AUTOHEAL_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE UPTIME_KUMA_IMAGE PROMETHEUS_IMAGE ALERTMANAGER_IMAGE POSTGRES_EXPORTER_IMAGE GRAFANA_IMAGE LOKI_IMAGE PROMTAIL_IMAGE NODE_RUNTIME_IMAGE DB_IMAGE REDIS_IMAGE MINIO_IMAGE)

{
  echo "created_at=${TIMESTAMP}"
  echo "manifest_version=2"
  echo "secret_files_copied=false"
  echo "git_head=$(git -C "${SCRIPT_DIR}/../.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
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
