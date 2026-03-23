#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

mode="${1:-tracked}"
if [[ "${mode}" != "tracked" && "${mode}" != "--staged" ]]; then
  echo "usage: $0 [tracked|--staged]" >&2
  exit 2
fi

declare -a targets=()
while IFS= read -r -d '' file; do
  case "${file}" in
    AGENTS.md|CLAUDE.md|GEMINI.md|CURSOR.md|COPILOT.md|docs/AGENT-CONTEXT.md|docs/agent/*|.cursor/*|.claude/*|.aider/*|.aider*|.windsurf/*|.codex/*|.ai/*)
      targets+=("${file}")
      ;;
  esac
done < <(
  if [[ "${mode}" == "--staged" ]]; then
    git diff --cached --name-only --diff-filter=ACMR -z
  else
    git ls-files -z
  fi
)

if [[ "${#targets[@]}" -eq 0 ]]; then
  exit 0
fi

echo "[guard] 금지된 AI/agent 문서 경로가 감지되어 중단합니다." >&2
for file in "${targets[@]}"; do
  echo " - ${file}" >&2
done
echo >&2
echo "해결 방법:" >&2
echo " 1) 추적 해제: git rm --cached <파일>" >&2
echo " 2) ignore 반영 확인 후 다시 커밋" >&2
exit 1
