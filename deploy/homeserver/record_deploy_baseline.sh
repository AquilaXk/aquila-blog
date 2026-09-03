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
PENDING_DIR="${SCRIPT_DIR}/.deploy-baseline.pending"
STAGING_DIR="${SCRIPT_DIR}/.deploy-baseline.staging.$$"
RECOVERY_DIR="${SCRIPT_DIR}/.deploy-baseline.recovery"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
PROFILE_WORKSPACE_CUTOVER_SHA="${PROFILE_WORKSPACE_CUTOVER_SHA:-}"
DEPLOY_BASELINE_SHA="${DEPLOY_BASELINE_SHA:-$(git -C "${SCRIPT_DIR}/../.." rev-parse HEAD 2>/dev/null || true)}"
MODE="${1:-}"

read_metadata_value() {
  awk -F= -v key="$1" '$1 == key { print substr($0, index($0, "=") + 1) }' "$2" | tail -n 1
}

recover_interrupted_publish() {
  if [[ ! -e "${RECOVERY_DIR}" ]]; then
    return
  fi
  if [[ -e "${BASELINE_DIR}" ]]; then
    rm -rf "${RECOVERY_DIR}"
  else
    mv "${RECOVERY_DIR}" "${BASELINE_DIR}"
  fi
}

cleanup_publish_scratch() {
  rm -rf "${STAGING_DIR}" 2>/dev/null || true
  if [[ -e "${RECOVERY_DIR}" ]]; then
    if [[ -e "${BASELINE_DIR}" ]]; then
      rm -rf "${RECOVERY_DIR}" 2>/dev/null || true
    else
      mv "${RECOVERY_DIR}" "${BASELINE_DIR}" 2>/dev/null || true
    fi
  fi
}

publish_snapshot() {
  local source_dir="$1"
  rm -rf "${RECOVERY_DIR}"
  if [[ -e "${BASELINE_DIR}" ]]; then
    mv "${BASELINE_DIR}" "${RECOVERY_DIR}"
  fi
  mv "${source_dir}" "${BASELINE_DIR}"
  rm -rf "${RECOVERY_DIR}"
}

trap cleanup_publish_scratch EXIT
recover_interrupted_publish

if [[ "${MODE}" == "--publish-pending" ]]; then
  [[ "${PROFILE_WORKSPACE_CUTOVER_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy baseline cutover marker is malformed" >&2; exit 1; }
  [[ -f "${PENDING_DIR}/docker-compose.prod.yml" && -f "${PENDING_DIR}/caddy/Caddyfile" && -f "${PENDING_DIR}/metadata.env" ]] || { echo "deploy baseline pending snapshot is incomplete" >&2; exit 1; }
  pending_marker="$(read_metadata_value profile_workspace_cutover_sha "${PENDING_DIR}/metadata.env")"
  pending_sha="$(read_metadata_value deploy_sha "${PENDING_DIR}/metadata.env")"
  [[ "${pending_marker}" == "${PROFILE_WORKSPACE_CUTOVER_SHA}" && "${pending_sha}" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy baseline pending snapshot does not match cutover" >&2; exit 1; }
  git -C "${SCRIPT_DIR}/../.." cat-file -e "${pending_marker}^{commit}" 2>/dev/null || { echo "deploy baseline pending marker commit is unavailable" >&2; exit 1; }
  git -C "${SCRIPT_DIR}/../.." cat-file -e "${pending_sha}^{commit}" 2>/dev/null || { echo "deploy baseline pending source commit is unavailable" >&2; exit 1; }
  git -C "${SCRIPT_DIR}/../.." merge-base --is-ancestor "${pending_marker}" "${pending_sha}" || { echo "deploy baseline pending source is below cutover" >&2; exit 1; }
  publish_snapshot "${PENDING_DIR}"
  echo "${BASELINE_DIR}"
  exit 0
fi
[[ "${MODE}" == "--stage-pending" ]] || { echo "unknown deploy baseline mode" >&2; exit 1; }

if [[ -n "${PROFILE_WORKSPACE_CUTOVER_SHA}" ]]; then
  [[ "${PROFILE_WORKSPACE_CUTOVER_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy baseline not recorded: profile workspace marker is malformed" >&2; exit 1; }
  git -C "${SCRIPT_DIR}/../.." cat-file -e "${PROFILE_WORKSPACE_CUTOVER_SHA}^{commit}" 2>/dev/null || { echo "deploy baseline not recorded: marker commit is unavailable" >&2; exit 1; }
fi
[[ "${DEPLOY_BASELINE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy baseline not recorded: deploy SHA is malformed" >&2; exit 1; }
git -C "${SCRIPT_DIR}/../.." cat-file -e "${DEPLOY_BASELINE_SHA}^{commit}" 2>/dev/null || { echo "deploy baseline not recorded: deploy commit is unavailable" >&2; exit 1; }
if [[ -n "${PROFILE_WORKSPACE_CUTOVER_SHA}" ]]; then
  git -C "${SCRIPT_DIR}/../.." merge-base --is-ancestor "${PROFILE_WORKSPACE_CUTOVER_SHA}" "${DEPLOY_BASELINE_SHA}" || { echo "deploy baseline not recorded: source is below profile workspace cutover" >&2; exit 1; }
fi

if [[ ! -f "${SCRIPT_DIR}/docker-compose.prod.yml" ]]; then
  echo "deploy baseline not recorded: compose file missing (${SCRIPT_DIR}/docker-compose.prod.yml)" >&2
  exit 1
fi

# A staging directory is never a published restore point. The fixed recovery directory
# above is the only crash-recovery owner and is restored before stale staging is removed.
rm -rf "${SCRIPT_DIR}"/.deploy-baseline.staging.*

mkdir -p "${STAGING_DIR}"

cp "${SCRIPT_DIR}/docker-compose.prod.yml" "${STAGING_DIR}/docker-compose.prod.yml"

[[ -f "${SCRIPT_DIR}/caddy/Caddyfile" ]] || { echo "deploy baseline not recorded: caddy config missing under ${SCRIPT_DIR}/caddy" >&2; exit 1; }
cp -R "${SCRIPT_DIR}/caddy" "${STAGING_DIR}/caddy"

{
  echo "created_at=${TIMESTAMP}"
  echo "baseline_version=2"
  echo "secret_files_copied=false"
  echo "deploy_sha=${DEPLOY_BASELINE_SHA}"
  echo "profile_workspace_cutover_sha=${PROFILE_WORKSPACE_CUTOVER_SHA}"
} > "${STAGING_DIR}/metadata.env"

# Publish only once the snapshot is complete: an interrupted copy must never leave a
# half-written baseline that a later rollback would treat as the last successful deploy.
# create_deploy_backup.sh accepts a baseline only when both files are present, so refuse to
# publish a snapshot that would fail that gate and silently demote rollback to the worktree.
if [[ ! -f "${STAGING_DIR}/docker-compose.prod.yml" || ! -f "${STAGING_DIR}/caddy/Caddyfile" ]]; then
  echo "deploy baseline not recorded: staged snapshot is incomplete (${STAGING_DIR})" >&2
  exit 1
fi

rm -rf "${PENDING_DIR}"
mv "${STAGING_DIR}" "${PENDING_DIR}"
echo "${PENDING_DIR}"
