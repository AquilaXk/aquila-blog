#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

mode="${1:-tracked}"
if [[ "${mode}" != "tracked" && "${mode}" != "--staged" ]]; then
  echo "usage: $0 [tracked|--staged]" >&2
  exit 2
fi

is_allowed_markdown() {
  case "$1" in
    README.md|\
    .github/pull_request_template.md|\
    SECURITY.md|\
    back/PERF_SANITY_REPORT.md|\
    back/README.md|\
    back/REFACTORING_ROADMAP.md|\
    deploy/homeserver/HARDENING.md|\
    front/.github/CODE_OF_CONDUCT.md|\
    front/.github/CONTRIBUTING.md|\
    front/.github/PULL_REQUEST_TEMPLATE.md|\
    front/README.md|\
    infra/README.md|\
    perf/k6/README.md|\
    tools/templates/agent-plan.compact.md|\
    tools/templates/bug-report.compact.md)
      return 0
      ;;
  esac

  return 1
}

declare -a targets=()
while IFS= read -r -d '' file; do
  case "${file}" in
    docs/design/*.md)
      ;;
    docs/*|AGENTS.md|CLAUDE.md|GEMINI.md|CURSOR.md|COPILOT.md|.cursor/*|.claude/*|.aider/*|.aider*|.windsurf/*|.codex/*|.ai/*)
      targets+=("${file}")
      ;;
    *.md)
      if ! is_allowed_markdown "${file}"; then
        targets+=("${file}")
      fi
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

echo "[guard] 비허용 문서/AI tool metadata가 감지되어 중단합니다." >&2
for file in "${targets[@]}"; do
  echo " - ${file}" >&2
done
echo >&2
echo "해결 방법:" >&2
echo " 1) 추적 해제: git rm --cached <파일>" >&2
echo " 2) ignore 반영 확인 후 다시 커밋" >&2
exit 1
