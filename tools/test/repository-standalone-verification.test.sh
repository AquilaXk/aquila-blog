#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
web_script="${repo_root}/tools/repo-split/verify-web-standalone.sh"
platform_script="${repo_root}/tools/repo-split/verify-platform-standalone.sh"
workflow="${repo_root}/.github/workflows/ci.yml"

fail() {
  echo "repository-standalone-verification: FAIL: $*" >&2
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "missing file: ${1#"${repo_root}/"}"
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "${expected}" "${file}" \
    || fail "${file#"${repo_root}/"} is missing contract: ${expected}"
}

assert_not_contains() {
  local file="$1"
  local forbidden="$2"
  if grep -Fq -- "${forbidden}" "${file}"; then
    fail "${file#"${repo_root}/"} contains forbidden contract: ${forbidden}"
  fi
}

for file in "${web_script}" "${platform_script}" "${workflow}"; do
  assert_file "${file}"
done
bash -n "${web_script}" "${platform_script}"

# Heavy gates must fail closed outside Actions; the static harness is the only
# supported local path and never executes Yarn, Gradle, Playwright, or Docker.
assert_contains "${web_script}" 'GITHUB_ACTIONS:-}'
assert_contains "${web_script}" 'STANDALONE_TEST_MODE:-}'
assert_contains "${platform_script}" 'GITHUB_ACTIONS:-}'
assert_contains "${platform_script}" 'STANDALONE_TEST_MODE:-}'

# Web archive and all required standalone checks.
assert_contains "${web_script}" 'archive --format=tar "${source_sha}" front'
assert_contains "${web_script}" 'git init --quiet'
assert_contains "${web_script}" 'git update-ref refs/remotes/origin/main HEAD'
assert_contains "${web_script}" '.github/workflows/ci.yml'
assert_contains "${web_script}" '.github/workflows/security.yml'
assert_contains "${web_script}" '.github/workflows/sonarcloud.yml'
assert_contains "${web_script}" '.github/workflows/production-live-verify.yml'
assert_contains "${web_script}" 'yarn install --frozen-lockfile'
assert_contains "${web_script}" 'yarn contracts:check'
assert_contains "${web_script}" 'yarn legal:check'
assert_contains "${web_script}" 'yarn lint'
assert_contains "${web_script}" 'yarn build'
assert_contains "${web_script}" 'yarn test:unit'
assert_contains "${web_script}" 'STORYBOOK_GATE_ENFORCEMENT=strict yarn storybook:gate'
assert_contains "${web_script}" 'npx playwright install --with-deps chromium'
assert_contains "${web_script}" 'yarn test:e2e:smoke'
assert_contains "${web_script}" 'yarn test:e2e:a11y'
assert_not_contains "${web_script}" 'git clone'

# Platform archive must physically remove Web and retain all required gates.
assert_contains "${platform_script}" 'rm -rf "${platform_root}/front"'
assert_contains "${platform_script}" 'git init --quiet'
assert_contains "${platform_script}" 'git update-ref refs/remotes/origin/main HEAD'
assert_contains "${platform_script}" 'check-platform-boundary.mjs --report-only'
assert_contains "${platform_script}" 'tools/contracts/check-public-contracts.mjs'
assert_contains "${platform_script}" 'tools/privacy/ci-privacy-gate.mjs'
assert_contains "${platform_script}" './gradlew check --rerun-tasks'
assert_contains "${platform_script}" 'docker-compose.prod.yml'
assert_contains "${platform_script}" 'config --quiet'
assert_not_contains "${platform_script}" 'git clone'

# The workflow publishes exactly the two temporary required check names and
# their evidence artifacts from the same checked-out SHA.
assert_contains "${workflow}" 'name: Web Standalone'
assert_contains "${workflow}" 'name: Platform Standalone'
assert_contains "${workflow}" 'repository-standalone-verification.test.sh'
assert_contains "${workflow}" 'verify-web-standalone.sh "${GITHUB_SHA}"'
assert_contains "${workflow}" 'verify-platform-standalone.sh "${GITHUB_SHA}"'
assert_contains "${workflow}" 'web-standalone-${{ github.sha }}'
assert_contains "${workflow}" 'platform-standalone-${{ github.sha }}'
assert_contains "${workflow}" 'persist-credentials: false'
assert_contains "${workflow}" 'fetch-depth: 0'

echo "repository-standalone-verification: PASS"
