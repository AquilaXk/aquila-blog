#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.prod"

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

require_pinned_image_value() {
  local code_prefix="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    post_precheck_env_fail "${code_prefix}_missing" "BACK_IMAGE is empty"
  fi
  if [[ "${value}" == *":latest" ]]; then
    post_precheck_env_fail "${code_prefix}_latest_forbidden" "latest tag is forbidden value=${value}"
  fi
  if [[ "${value}" != *@sha256:* && "${value}" != *:* ]]; then
    post_precheck_env_fail "${code_prefix}_unpinned" "image must include tag or digest value=${value}"
  fi
}

main() {
  local staged_back_image
  local enabled_value
  local api_key_value
  local api_key_present="false"
  local persisted_back_image

  if [[ ! -f "${ENV_FILE}" ]]; then
    post_precheck_env_fail "env_file_missing" "missing env file=${ENV_FILE}"
  fi

  staged_back_image="${STAGED_BACK_IMAGE:-${1:-}}"
  staged_back_image="$(trim_quotes "${staged_back_image}")"
  require_pinned_image_value "staged_back_image" "${staged_back_image}"

  echo "[POST_PRECHECK_ENV] checkpoint=after_pgroonga_precheck"

  enabled_value="$(trim_quotes "$(env_value "CUSTOM__AI__SUMMARY__ENABLED")")"
  enabled_value="$(printf '%s' "${enabled_value}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  api_key_value="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__API_KEY")"
  if [[ -n "${api_key_value}" ]]; then
    api_key_present="true"
  fi

  echo "[POST_PRECHECK_ENV] ai_summary_guard enabled=${enabled_value:-false} api_key_present=${api_key_present}"
  if [[ "${enabled_value}" == "true" && -z "${api_key_value}" ]]; then
    post_precheck_env_fail "ai_summary_missing_api_key" "CUSTOM__AI__SUMMARY__ENABLED=true but CUSTOM__AI__SUMMARY__GEMINI__API_KEY is empty"
  fi

  echo "[POST_PRECHECK_ENV] checkpoint=after_ai_summary_guard"
  echo "[POST_PRECHECK_ENV] checkpoint=before_back_image_persist target=${staged_back_image}"

  upsert_env_key "BACK_IMAGE" "${staged_back_image}"
  persisted_back_image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  require_pinned_image_value "persisted_back_image" "${persisted_back_image}"

  echo "[POST_PRECHECK_ENV] checkpoint=after_back_image_persist image=${persisted_back_image}"
  echo "[POST_PRECHECK_ENV] passed"
}

main "$@"
