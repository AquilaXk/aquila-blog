#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
STATE_FILE="${SCRIPT_DIR}/.active_backend"

mkdir -p "${BACKUP_DIR}"

for file in Caddyfile .env.prod docker-compose.prod.yml .active_backend; do
  if [[ -f "${SCRIPT_DIR}/${file}" ]]; then
    cp "${SCRIPT_DIR}/${file}" "${BACKUP_DIR}/${file}"
  fi
done

{
  echo "created_at=${TIMESTAMP}"
  echo "git_head=$(git -C "${SCRIPT_DIR}/../.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
  if [[ -f "${STATE_FILE}" ]]; then
    echo "active_backend=$(cat "${STATE_FILE}")"
  fi
} > "${BACKUP_DIR}/metadata.env"

echo "${BACKUP_DIR}"
