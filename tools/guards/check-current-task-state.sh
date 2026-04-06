#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

CURRENT_TASK_FILE="${CURRENT_TASK_FILE_PATH:-${REPO_ROOT}/.codex/current-task.local}"

if [[ ! -f "${CURRENT_TASK_FILE}" ]]; then
  exit 0
fi

status=""
task=""
repro=""
done_when=""
forbid=""
scope_mode=""
target_edit=""
next_action=""
avoid=""
pause_snapshot=""
confirmed_cause=""
root_hypothesis=""
declare -a allow_patterns=()
declare -a deny_patterns=()

while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
  line="${raw_line%%$'\r'}"
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue

  case "${line}" in
    status=*) status="${line#status=}" ;;
    task=*) task="${line#task=}" ;;
    repro=*) repro="${line#repro=}" ;;
    done_when=*) done_when="${line#done_when=}" ;;
    forbid=*) forbid="${line#forbid=}" ;;
    scope_mode=*) scope_mode="${line#scope_mode=}" ;;
    target_edit=*) target_edit="${line#target_edit=}" ;;
    next_action=*) next_action="${line#next_action=}" ;;
    avoid=*) avoid="${line#avoid=}" ;;
    pause_snapshot=*) pause_snapshot="${line#pause_snapshot=}" ;;
    confirmed_cause=*) confirmed_cause="${line#confirmed_cause=}" ;;
    root_hypothesis=*) root_hypothesis="${line#root_hypothesis=}" ;;
    allow=*) allow_patterns+=("${line#allow=}") ;;
    deny=*) deny_patterns+=("${line#deny=}") ;;
  esac
done < "${CURRENT_TASK_FILE}"

if [[ -z "${status}" ]]; then
  echo "[current-task-state] status 가 없습니다: ${CURRENT_TASK_FILE}" >&2
  exit 1
fi

if [[ "${status}" != "active" && "${status}" != "done" ]]; then
  echo "[current-task-state] status 는 active|done 이어야 합니다: ${status}" >&2
  exit 1
fi

if [[ "${status}" == "done" ]]; then
  exit 0
fi

require_nonempty() {
  local name="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "[current-task-state] active task인데 ${name}= 이 비어 있습니다." >&2
    exit 1
  fi
}

require_nonempty "task" "${task}"
require_nonempty "repro" "${repro}"
require_nonempty "done_when" "${done_when}"
require_nonempty "forbid" "${forbid}"
if [[ -z "${scope_mode}" ]]; then
  scope_mode="staged"
fi
require_nonempty "target_edit" "${target_edit}"
require_nonempty "next_action" "${next_action}"
require_nonempty "avoid" "${avoid}"
require_nonempty "pause_snapshot" "${pause_snapshot}"

if [[ ${#allow_patterns[@]} -eq 0 ]]; then
  echo "[current-task-state] active task인데 allow 패턴이 없습니다." >&2
  exit 1
fi

if [[ ${#deny_patterns[@]} -eq 0 ]]; then
  echo "[current-task-state] active task인데 deny 패턴이 없습니다." >&2
  exit 1
fi

case "${next_action}" in
  trace|instrument|patch|test|blocked)
    ;;
  *)
    echo "[current-task-state] next_action 은 trace|instrument|patch|test|blocked 중 하나여야 합니다: ${next_action}" >&2
    exit 1
    ;;
esac

if [[ "${confirmed_cause}" == "미확정" ]]; then
  echo "[current-task-state] confirmed_cause=미확정 은 금지입니다. root_hypothesis 를 사용하세요." >&2
  exit 1
fi

if [[ -z "${confirmed_cause}" && -z "${root_hypothesis}" ]]; then
  echo "[current-task-state] confirmed_cause 또는 root_hypothesis 중 하나는 필요합니다." >&2
  exit 1
fi

if [[ "${next_action}" == "patch" && -z "${target_edit}" ]]; then
  echo "[current-task-state] next_action=patch 인데 target_edit 가 비어 있습니다." >&2
  exit 1
fi

if [[ "${pause_snapshot}" != *"\\n"* ]]; then
  echo "[current-task-state] pause_snapshot 은 4줄 요약을 \\n 로 보존해야 합니다." >&2
  exit 1
fi

if [[ -n "${scope_mode}" && "${scope_mode}" != "staged" && "${scope_mode}" != "worktree" ]]; then
  echo "[current-task-state] scope_mode 는 staged|worktree 만 허용됩니다: ${scope_mode}" >&2
  exit 1
fi

exit 0
