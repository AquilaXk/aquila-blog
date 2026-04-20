#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

source tools/guards/current-task-common.sh

output_mode="absolute"
prefer_thread="false"

for arg in "$@"; do
  case "${arg}" in
    --relative)
      output_mode="relative"
      ;;
    --prefer-thread)
      prefer_thread="true"
      ;;
    *)
      echo "[current-task-resolve] usage: $0 [--relative] [--prefer-thread]" >&2
      exit 1
      ;;
  esac
done

normalize_path() {
  local raw="$1"
  if [[ "${raw}" == /* ]]; then
    printf '%s\n' "${raw}"
    return 0
  fi

  local trimmed="${raw#./}"
  printf '%s/%s\n' "${REPO_ROOT}" "${trimmed}"
}

as_relative() {
  local absolute_path="$1"
  if [[ "${absolute_path}" == "${REPO_ROOT}/"* ]]; then
    printf '%s\n' "${absolute_path#${REPO_ROOT}/}"
    return 0
  fi

  if [[ "${absolute_path}" == "${REPO_ROOT}" ]]; then
    printf '.\n'
    return 0
  fi

  printf '%s\n' "${absolute_path}"
}

legacy_file="$(current_task_legacy_file "${REPO_ROOT}")"
work_item_file="$(current_task_work_item_file "${REPO_ROOT}")"
thread_file=""
if [[ -n "${CODEX_THREAD_ID:-}" ]]; then
  thread_file="$(current_task_tasks_dir "${REPO_ROOT}")/${CODEX_THREAD_ID}.local"
fi

resolved_file=""
if [[ -n "${CURRENT_TASK_FILE_PATH:-}" ]]; then
  resolved_file="$(normalize_path "${CURRENT_TASK_FILE_PATH}")"
elif [[ -n "${work_item_file}" ]]; then
  resolved_file="${work_item_file}"
elif [[ -n "${thread_file}" && ( "${prefer_thread}" == "true" || -f "${thread_file}" ) ]]; then
  resolved_file="${thread_file}"
else
  resolved_file="${legacy_file}"
fi

if [[ "${output_mode}" == "relative" ]]; then
  as_relative "${resolved_file}"
  exit 0
fi

printf '%s\n' "${resolved_file}"
