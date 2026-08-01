#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash tools/repo-split/verify-web-standalone.sh [source-ref]

Creates a temporary archive containing only front/** and runs the future Web
repository's blocking quality gates inside that extracted root. Heavy execution
is restricted to GitHub Actions; the static harness uses STANDALONE_TEST_MODE.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${GITHUB_ACTIONS:-}" != "true" && "${STANDALONE_TEST_MODE:-}" != "true" ]]; then
  echo "verify-web-standalone: heavy standalone verification is GitHub Actions-only" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${1:-${STANDALONE_SOURCE_REF:-HEAD}}"
source_sha="$(git -C "${repo_root}" rev-parse "${source_ref}^{commit}")"
artifact_dir="${STANDALONE_ARTIFACT_DIR:-${RUNNER_TEMP:-${repo_root}/.tmp}/web-standalone}"
work_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aquila-web-standalone.XXXXXX")"
web_root="${work_dir}/archive/front"
log_file="${artifact_dir}/web-standalone.log"

cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

mkdir -p "${web_root}" "${artifact_dir}"
: > "${log_file}"

run_step() {
  local label="$1"
  shift
  {
    printf '\n===== %s =====\n' "${label}"
    printf 'command:'
    printf ' %q' "$@"
    printf '\n'
  } | tee -a "${log_file}"
  "$@" 2>&1 | tee -a "${log_file}"
}

printf '%s\n' "${source_sha}" > "${artifact_dir}/source-sha.txt"
printf 'gate=Web Standalone\nsource_ref=%s\nsource_sha=%s\n' \
  "${source_ref}" "${source_sha}" > "${artifact_dir}/summary.txt"

# Archive the exact Git object, not the mutable working tree. Keeping the front/
# prefix lets the harness prove that no Platform-owned root is smuggled in.
git -C "${repo_root}" archive --format=tar "${source_sha}" front \
  | tar -xf - -C "${work_dir}/archive"

if [[ ! -f "${web_root}/package.json" || ! -f "${web_root}/yarn.lock" ]]; then
  echo "verify-web-standalone: extracted Web archive is missing package metadata" >&2
  exit 1
fi

required_workflows=(
  ".github/workflows/ci.yml"
  ".github/workflows/security.yml"
  ".github/workflows/sonarcloud.yml"
  ".github/workflows/production-live-verify.yml"
)
: > "${artifact_dir}/workflow-presence.txt"
for workflow in "${required_workflows[@]}"; do
  if [[ ! -f "${web_root}/${workflow}" ]]; then
    echo "verify-web-standalone: missing Web-root workflow ${workflow}" >&2
    exit 1
  fi
  printf '%s\n' "${workflow}" >> "${artifact_dir}/workflow-presence.txt"
done

if [[ -e "${web_root}/back" || -e "${web_root}/deploy" || -e "${web_root}/infra" ]]; then
  echo "verify-web-standalone: Platform-owned root leaked into Web archive" >&2
  exit 1
fi

# Boundary/build scripts read Git metadata. Recreate a repository around the
# immutable archive so they execute as they will in aquila-blog-web, without
# checking out Platform source or depending on the mutable monorepo worktree.
(
  cd "${web_root}"
  git init --quiet
  git config user.name "Aquila Standalone Gate"
  git config user.email "standalone-gate@users.noreply.github.com"
  git add -f .
  git commit --quiet -m "chore(snapshot): Web standalone ${source_sha}"
  git branch -M main
  git update-ref refs/remotes/origin/main HEAD
)

(
  cd "${web_root}"
  git ls-files | LC_ALL=C sort > "${artifact_dir}/archive-manifest.txt"

  run_step "Install frozen Web dependencies" yarn install --frozen-lockfile
  run_step "Verify Web repository boundary" node scripts/repo-boundary/check-web-boundary.mjs
  run_step "Verify Web Node contracts" node --test \
    scripts/env/env-contract.test.mjs \
    scripts/live/resolve-live-targets.test.mjs \
    scripts/repo-boundary/web-build-inputs.test.mjs
  run_step "Verify pinned Platform contract" yarn contracts:check
  run_step "Verify legal policy export" yarn legal:check
  run_step "Lint Web" yarn lint
  run_step "Build Web" yarn build
  run_step "Run Web unit tests" yarn test:unit
  run_step "Build and verify Storybook" env STORYBOOK_GATE_ENFORCEMENT=strict yarn storybook:gate
  run_step "Install Playwright Chromium" npx playwright install --with-deps chromium
  run_step "Run Web smoke E2E" env NEXT_PUBLIC_SIGNUP_ENABLED=true yarn test:e2e:smoke
  run_step "Run Web accessibility E2E" env NEXT_PUBLIC_SIGNUP_ENABLED=true yarn test:e2e:a11y
)

sha256sum \
  "${artifact_dir}/archive-manifest.txt" \
  "${artifact_dir}/workflow-presence.txt" \
  "${artifact_dir}/web-standalone.log" \
  > "${artifact_dir}/SHA256SUMS"

echo "verify-web-standalone: PASS source_sha=${source_sha}"
