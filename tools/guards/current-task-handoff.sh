#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

CURRENT_TASK_FILE="${CURRENT_TASK_FILE_PATH:-${REPO_ROOT}/.codex/current-task.local}"

if [[ ! -f "${CURRENT_TASK_FILE}" ]]; then
  echo "[current-task-handoff] current-task file not found: ${CURRENT_TASK_FILE}" >&2
  exit 1
fi

task=""
repro=""
target_edit=""
next_action=""
pause_snapshot=""

while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
  line="${raw_line%%$'\r'}"
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue
  case "${line}" in
    task=*) task="${line#task=}" ;;
    repro=*) repro="${line#repro=}" ;;
    target_edit=*) target_edit="${line#target_edit=}" ;;
    next_action=*) next_action="${line#next_action=}" ;;
    pause_snapshot=*) pause_snapshot="${line#pause_snapshot=}" ;;
  esac
done < "${CURRENT_TASK_FILE}"

if [[ -z "${task}" || -z "${pause_snapshot}" ]]; then
  echo "[current-task-handoff] task/pause_snapshot is required" >&2
  exit 1
fi

printf '작업: %s\n' "${task}"
if [[ -n "${repro}" ]]; then
  printf '재현: %s\n' "${repro}"
fi
if [[ -n "${target_edit}" ]]; then
  printf '다음 편집: %s\n' "${target_edit}"
fi
if [[ -n "${next_action}" ]]; then
  printf '다음 액션: %s\n' "${next_action}"
fi
printf '%b\n' "${pause_snapshot}"
