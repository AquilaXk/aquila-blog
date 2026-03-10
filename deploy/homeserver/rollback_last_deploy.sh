#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

latest_backup() {
  ls -1dt "${BACKUP_ROOT}"/* 2>/dev/null | head -n 1
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

compose up -d db_1 redis_1 caddy cloudflared back_blue back_green
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true

if [[ -f "${SCRIPT_DIR}/.active_backend" ]]; then
  target_backend="$(cat "${SCRIPT_DIR}/.active_backend" || true)"
  if [[ "${target_backend}" == "back_blue" || "${target_backend}" == "back_green" ]]; then
    compose up -d "${target_backend}"
    other_backend="back_blue"
    [[ "${target_backend}" == "back_blue" ]] || other_backend="back_green"
    compose stop "${other_backend}" || true
  fi
fi

compose ps
