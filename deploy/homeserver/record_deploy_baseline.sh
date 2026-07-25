#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

umask 077

# Records the file set of a deploy that finished every post-deploy verification.
# create_deploy_backup.sh uses this snapshot as the rollback restore point, so the
# restore point stays pinned to the last successful deploy even when a failed deploy
# rolled back and mutated the server working tree on its way out.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASELINE_DIR="${SCRIPT_DIR}/.deploy-baseline"
STAGING_DIR="${SCRIPT_DIR}/.deploy-baseline.staging.$$"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

cleanup_staging() {
  rm -rf "${STAGING_DIR}" 2>/dev/null || true
}
trap cleanup_staging EXIT

if [[ ! -f "${SCRIPT_DIR}/docker-compose.prod.yml" ]]; then
  echo "deploy baseline not recorded: compose file missing (${SCRIPT_DIR}/docker-compose.prod.yml)" >&2
  exit 1
fi

rm -rf "${STAGING_DIR}"
mkdir -p "${STAGING_DIR}"

cp "${SCRIPT_DIR}/docker-compose.prod.yml" "${STAGING_DIR}/docker-compose.prod.yml"

if [[ -d "${SCRIPT_DIR}/caddy" ]]; then
  cp -R "${SCRIPT_DIR}/caddy" "${STAGING_DIR}/caddy"
elif [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
  # legacy fallback for older layout
  mkdir -p "${STAGING_DIR}/caddy"
  cp "${SCRIPT_DIR}/Caddyfile" "${STAGING_DIR}/caddy/Caddyfile"
else
  echo "deploy baseline not recorded: caddy config missing under ${SCRIPT_DIR}" >&2
  exit 1
fi

{
  echo "created_at=${TIMESTAMP}"
  echo "baseline_version=1"
  echo "secret_files_copied=false"
  echo "deploy_sha=$(git -C "${SCRIPT_DIR}/../.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
} > "${STAGING_DIR}/metadata.env"

# Publish only once the snapshot is complete: an interrupted copy must never leave a
# half-written baseline that a later rollback would treat as the last successful deploy.
rm -rf "${BASELINE_DIR}"
mv "${STAGING_DIR}" "${BASELINE_DIR}"

echo "${BASELINE_DIR}"
