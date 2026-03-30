#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
TARGET_DB_NAME="unknown"

compose() {
  BACK_IMAGE="${BACK_IMAGE}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

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

one_line_file() {
  local path="$1"
  tr '\r\n' ' ' < "${path}" | xargs || true
}

require_back_image() {
  local value="${BACK_IMAGE:-}"

  if [[ -z "${value}" ]]; then
    pgroonga_precheck_fail "back_image_missing" "BACK_IMAGE is empty in shell env"
  fi
  if [[ "${value}" == *":latest" ]]; then
    pgroonga_precheck_fail "back_image_latest_forbidden" "BACK_IMAGE latest is forbidden value=${value}"
  fi
  if [[ "${value}" != *@sha256:* && "${value}" != *:* ]]; then
    pgroonga_precheck_fail "back_image_unpinned" "BACK_IMAGE must include tag or digest value=${value}"
  fi
}

resolve_target_db_name() {
  local db_name
  local db_base_name

  db_name="$(trim_quotes "$(env_value "CUSTOM_PROD_DBNAME")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  db_base_name="$(trim_quotes "$(env_value "DB_BASE_NAME")")"
  if [[ -n "${db_base_name}" ]]; then
    echo "${db_base_name}_prod"
    return
  fi

  echo "blog_prod"
}

pgroonga_precheck_fail() {
  local code="$1"
  local detail="$2"
  echo "::error title=PGroonga precheck failed::[PGROONGA_PRECHECK_FAILED] code=${code} db=${TARGET_DB_NAME} detail=${detail}"
  echo "[PGROONGA_PRECHECK_FAILED] code=${code} db=${TARGET_DB_NAME} detail=${detail}" >&2
  exit 1
}

run_pgroonga_query() {
  local out_var="$1"
  local sql="$2"
  local stdout_file
  local stderr_file
  local stdout_one_line
  local stderr_one_line
  local normalized_output

  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if ! compose exec -T db_1 sh -lc "psql -U postgres -d '${TARGET_DB_NAME}' -tAc \"$sql\"" >"${stdout_file}" 2>"${stderr_file}"; then
    stdout_one_line="$(one_line_file "${stdout_file}")"
    stderr_one_line="$(one_line_file "${stderr_file}")"
    echo "[PGROONGA_QUERY_EXEC_FAILED] db=${TARGET_DB_NAME} sql=${sql} stdout=${stdout_one_line:-empty} stderr=${stderr_one_line:-empty}" >&2
    rm -f "${stdout_file}" "${stderr_file}"
    return 1
  fi

  normalized_output="$(tr -d '\r' < "${stdout_file}" | xargs || true)"
  rm -f "${stdout_file}" "${stderr_file}"
  printf -v "${out_var}" '%s' "${normalized_output}"
  return 0
}

main() {
  local startup_stderr
  local startup_stderr_one_line

  if [[ ! -f "${ENV_FILE}" ]]; then
    pgroonga_precheck_fail "env_file_missing" "missing env file=${ENV_FILE}"
  fi

  TARGET_DB_NAME="$(resolve_target_db_name)"
  require_back_image

  echo "pgroonga precheck target db=${TARGET_DB_NAME}"
  startup_stderr="$(mktemp)"
  if ! compose up -d db_1 >/dev/null 2>"${startup_stderr}"; then
    startup_stderr_one_line="$(one_line_file "${startup_stderr}")"
    rm -f "${startup_stderr}"
    pgroonga_precheck_fail "db_start_failed" "compose_up_failed stderr=${startup_stderr_one_line:-empty}"
  fi
  rm -f "${startup_stderr}"

  echo "pgroonga install attempt"
  if ! compose exec -T db_1 sh -lc "psql -U postgres -d '${TARGET_DB_NAME}' -v ON_ERROR_STOP=1 -c \"CREATE EXTENSION IF NOT EXISTS pgroonga;\""; then
    pgroonga_precheck_fail "install_failed" "create_extension_failed"
  fi

  PGROONGA_EXT_OK=""
  if ! run_pgroonga_query PGROONGA_EXT_OK "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgroonga');"; then
    pgroonga_precheck_fail "extension_check_exec_failed" "query_exec_failed"
  fi
  echo "pgroonga extension check result: ${PGROONGA_EXT_OK:-empty}"
  if [[ "${PGROONGA_EXT_OK}" != "t" ]]; then
    pgroonga_precheck_fail "extension_missing" "pg_extension_not_found value=${PGROONGA_EXT_OK:-empty}"
  fi

  PGROONGA_OP_OK=""
  if ! run_pgroonga_query PGROONGA_OP_OK "SELECT (ARRAY['ping'::text, 'pong'::text] &@~ 'ping');"; then
    pgroonga_precheck_fail "operator_check_exec_failed" "query_exec_failed"
  fi
  echo "pgroonga operator check result: ${PGROONGA_OP_OK:-empty}"
  if [[ "${PGROONGA_OP_OK}" != "t" ]]; then
    pgroonga_precheck_fail "operator_failed" "andatilde_operator_check_failed value=${PGROONGA_OP_OK:-empty}"
  fi

  echo "pgroonga precheck passed"
}

main "$@"
