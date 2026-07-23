#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

CURRENT_TASK_FILE="$(bash tools/guards/current-task-resolve.sh)"
CURRENT_TASK_FILE_REL="$(bash tools/guards/current-task-resolve.sh --relative)"
scope_mode="staged"

if [[ ! -f "${CURRENT_TASK_FILE}" ]]; then
  bash tools/guards/current-task-init.sh
fi

if [[ -f "${CURRENT_TASK_FILE}" ]]; then
  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    line="${raw_line%%$'\r'}"
    [[ -z "${line}" ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue
    case "${line}" in
      scope_mode=*)
        scope_mode="${line#scope_mode=}"
        ;;
    esac
  done < "${CURRENT_TASK_FILE}"
fi

status="$(CURRENT_TASK_FILE_PATH="${CURRENT_TASK_FILE}" bash tools/guards/current-task-read-field.sh status)"
if [[ "${status}" == "draft" ]]; then
  echo "[current-task-preflight] draft current-task file 이 자동 생성되었습니다: ${CURRENT_TASK_FILE_REL}" >&2
  echo "[current-task-preflight] task/repro/done_when/forbid/allow/deny 를 채운 뒤 다시 실행하세요." >&2
  exit 1
fi

if [[ "${scope_mode}" != "staged" && "${scope_mode}" != "worktree" ]]; then
  echo "[current-task-preflight] scope_mode 는 staged|worktree 만 허용됩니다: ${scope_mode}" >&2
  exit 1
fi

bash tools/guards/check-current-task-state.sh
bash tools/guards/check-current-task-scope.sh "--${scope_mode}"

echo "[current-task-preflight] ok: current-task state/scope verified (mode=${scope_mode})"
