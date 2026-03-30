#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

CURRENT_TASK_FILE="${REPO_ROOT}/.codex/current-task.local"

if [[ "${1:-}" != "--staged" ]]; then
  echo "[current-task-scope] usage: $0 --staged" >&2
  exit 1
fi

if [[ ! -f "${CURRENT_TASK_FILE}" ]]; then
  exit 0
fi

status=""
task=""
done_when=""
declare -a allow_patterns=()
declare -a deny_patterns=()

while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
  line="${raw_line%%$'\r'}"
  [[ -z "${line}" ]] && continue
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue

  case "${line}" in
    status=*)
      status="${line#status=}"
      ;;
    task=*)
      task="${line#task=}"
      ;;
    done_when=*)
      done_when="${line#done_when=}"
      ;;
    allow=*)
      allow_patterns+=("${line#allow=}")
      ;;
    deny=*)
      deny_patterns+=("${line#deny=}")
      ;;
  esac
done < "${CURRENT_TASK_FILE}"

if [[ "${status}" != "active" ]]; then
  exit 0
fi

if [[ ${#allow_patterns[@]} -eq 0 ]]; then
  echo "[current-task-scope] active task인데 allow 패턴이 없습니다: ${CURRENT_TASK_FILE}" >&2
  echo "[current-task-scope] 최소 1개 이상의 allow=glob 를 정의하세요." >&2
  exit 1
fi

staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"
if [[ -z "${staged_files}" ]]; then
  exit 0
fi

matches_any_pattern() {
  local target="$1"
  shift
  local pattern
  for pattern in "$@"; do
    if [[ "${target}" == ${pattern} ]]; then
      return 0
    fi
  done
  return 1
}

declare -a deny_hits=()
declare -a scope_violations=()

while IFS= read -r file; do
  [[ -z "${file}" ]] && continue

  if [[ ${#deny_patterns[@]} -gt 0 ]] && matches_any_pattern "${file}" "${deny_patterns[@]}"; then
    deny_hits+=("${file}")
    continue
  fi

  if ! matches_any_pattern "${file}" "${allow_patterns[@]}"; then
    scope_violations+=("${file}")
  fi
done <<< "${staged_files}"

if [[ ${#deny_hits[@]} -eq 0 && ${#scope_violations[@]} -eq 0 ]]; then
  exit 0
fi

echo "[current-task-scope] current task 범위를 벗어난 staged 파일이 있습니다." >&2
if [[ -n "${task}" ]]; then
  echo "[current-task-scope] task: ${task}" >&2
fi
if [[ -n "${done_when}" ]]; then
  echo "[current-task-scope] done_when: ${done_when}" >&2
fi

if [[ ${#deny_hits[@]} -gt 0 ]]; then
  echo "[current-task-scope] deny 패턴 위반:" >&2
  printf '  - %s\n' "${deny_hits[@]}" >&2
fi

if [[ ${#scope_violations[@]} -gt 0 ]]; then
  echo "[current-task-scope] allow 패턴 밖 파일:" >&2
  printf '  - %s\n' "${scope_violations[@]}" >&2
fi

echo "[current-task-scope] 해결 방법:" >&2
echo "  1) 이번 작업 범위가 맞다면 .codex/current-task.local 의 allow/deny 를 먼저 갱신" >&2
echo "  2) 범위 밖 변경이면 git restore --staged <file> 로 스테이징 해제" >&2
echo "  3) 컨텍스트 압축 후 재진입이면 AGENT-CONTEXT/brief/current-task 를 다시 확인" >&2
exit 1
