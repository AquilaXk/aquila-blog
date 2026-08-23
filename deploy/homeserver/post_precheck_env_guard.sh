#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CURSOR_KEYRING_GUARD="${SCRIPT_DIR}/cursor_keyring_guard.sh"

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      print value
    }
  ' "${ENV_FILE}" | tail -n 1
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "${value}"
}

upsert_env_key() {
  local key="$1"
  local value="$2"

  if grep -qE "^${key}=" "${ENV_FILE}"; then
    grep -vE "^${key}=" "${ENV_FILE}" > "${ENV_FILE}.tmp"
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

post_precheck_env_fail() {
  local code="$1"
  local detail="$2"
  echo "::error title=Post-precheck env failed::[POST_PRECHECK_ENV_FAILED] code=${code} detail=${detail}"
  echo "[POST_PRECHECK_ENV_FAILED] code=${code} detail=${detail}" >&2
  exit 1
}

require_digest_image_value() {
  local code_prefix="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    post_precheck_env_fail "${code_prefix}_missing" "STAGED_BACK_IMAGE is empty"
  fi
  if [[ "${value}" == *":latest" || "${value}" == *":latest@"* ]]; then
    post_precheck_env_fail "${code_prefix}_latest_forbidden" "latest tag is forbidden value=${value}"
  fi
  if [[ ! "${value}" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]; then
    post_precheck_env_fail "${code_prefix}_not_digest" "image must be pinned by sha256 digest value=${value}"
  fi
}

main() {
  local staged_back_image
  local enabled_value
  local api_key_value
  local api_key_present="false"

  if [[ ! -f "${ENV_FILE}" ]]; then
    post_precheck_env_fail "env_file_missing" "missing env file=${ENV_FILE}"
  fi
  if [[ ! -x "${CURSOR_KEYRING_GUARD}" ]]; then
    post_precheck_env_fail "cursor_keyring_guard_missing" "cursor keyring guard is missing or not executable"
  fi
  if ! "${CURSOR_KEYRING_GUARD}" "${ENV_FILE}"; then
    post_precheck_env_fail "cursor_keyring_invalid" "cursor keyring validation failed"
  fi
  if [[ ! -x "${SCRIPT_DIR}/minio_service_identity.sh" ]]; then
    post_precheck_env_fail "minio_identity_guard_missing" "MinIO service identity guard is missing or not executable"
  fi
  if ! "${SCRIPT_DIR}/minio_service_identity.sh" check "${ENV_FILE}" "blog_home_data"; then
    post_precheck_env_fail "minio_identity_invalid" "MinIO service identity verification failed"
  fi

  staged_back_image="${STAGED_BACK_IMAGE:-${1:-}}"
  staged_back_image="$(trim_quotes "${staged_back_image}")"
  require_digest_image_value "staged_back_image" "${staged_back_image}"

  echo "[POST_PRECHECK_ENV] checkpoint=after_cursor_keyring_guard"
  echo "[POST_PRECHECK_ENV] checkpoint=after_minio_service_identity_guard"
  echo "[POST_PRECHECK_ENV] checkpoint=after_pgroonga_precheck"

  echo "[POST_PRECHECK_ENV] checkpoint=staged_back_image_validated image=${staged_back_image}"
  echo "[POST_PRECHECK_ENV] passed"
}

main "$@"
