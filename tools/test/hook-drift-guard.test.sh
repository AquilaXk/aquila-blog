#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
guard_path="${repo_root}/tools/guards/check-hook-drift.sh"
# A commit hook supplies a temporary index for the owner repository. Fixture repositories
# must use their own indexes or Git attempts to build their trees from the owner's index.
unset GIT_INDEX_FILE

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

owner="${workdir}/owner"
linked="${workdir}/linked"

git -c init.defaultBranch=main init -q "${owner}"
git -C "${owner}" config user.email hook-drift@example.invalid
git -C "${owner}" config user.name 'Hook Drift Test'
mkdir -p "${owner}/.githooks"
for hook in commit-msg pre-commit pre-push; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "${owner}/.githooks/${hook}"
  chmod +x "${owner}/.githooks/${hook}"
done
git -C "${owner}" config core.hooksPath .githooks
git -C "${owner}" add .githooks
git -C "${owner}" commit -qm 'test: fixture hooks'
git -C "${owner}" worktree add -qb linked "${linked}"

guard_output="${workdir}/guard-output"
sync_guidance='[hook-drift] sync with: git config core.hooksPath .githooks'

expect_pass() {
  local label="$1"
  local directory="$2"
  if ! git -C "${directory}" config core.hooksPath .githooks ||
    ! (cd "${directory}" && bash "${guard_path}") >"${guard_output}" 2>&1; then
    echo "[test] expected hook drift guard to pass: ${label}" >&2
    cat "${guard_output}" >&2
    exit 1
  fi
}

expect_fail() {
  local label="$1"
  local directory="$2"
  if (cd "${directory}" && bash "${guard_path}") >"${guard_output}" 2>&1; then
    echo "[test] expected hook drift guard to fail: ${label}" >&2
    exit 1
  fi
  if ! grep -qxF -- "${sync_guidance}" "${guard_output}"; then
    echo "[test] expected exact sync guidance for: ${label}" >&2
    cat "${guard_output}" >&2
    exit 1
  fi
}

# A relative path resolves against each worktree's own git directory, so both checked-out
# tracked hook directories must pass.
expect_pass 'owner root with relative hooks path' "${owner}"
expect_pass 'linked worktree with relative hooks path' "${linked}"

# core.hooksPath is shared by default. Absolute configuration is rejected even when it points
# at the owner root itself, because only a repository-relative path stays correct in linked
# worktrees.
git -C "${owner}" config core.hooksPath "${owner}/.githooks"
expect_fail 'owner root with absolute hooks path' "${owner}"
expect_fail 'linked worktree with stale owner absolute hooks path' "${linked}"

git -C "${owner}" config --unset-all core.hooksPath
expect_fail 'owner root with unset hooks path' "${owner}"
expect_fail 'linked worktree with unset hooks path' "${linked}"

route_repo="${workdir}/route-repo"
route_trace="${workdir}/route-trace"
route_output="${workdir}/route-output"

write_shell_stub() {
  local path="$1"
  local marker="${2-}"
  mkdir -p "$(dirname "${path}")"
  if [[ -n "${marker}" ]]; then
    printf '#!/usr/bin/env bash\nprintf '\''%%s\\n'\'' '\''%s'\'' >> "${HOOK_TRACE}"\n' "${marker}" >"${path}"
  else
    printf '#!/usr/bin/env bash\nexit 0\n' >"${path}"
  fi
  chmod +x "${path}"
}

write_node_stub() {
  local path="$1"
  local marker="${2-}"
  mkdir -p "$(dirname "${path}")"
  if [[ -n "${marker}" ]]; then
    printf 'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.HOOK_TRACE, "%s\\n");\n' "${marker}" >"${path}"
  else
    printf 'process.exit(0);\n' >"${path}"
  fi
}

assert_route_marker() {
  local marker="$1"
  if ! grep -qxF -- "${marker}" "${route_trace}"; then
    echo "[test] expected pre-commit route marker: ${marker}" >&2
    cat "${route_output}" >&2
    exit 1
  fi
}

assert_no_route_marker() {
  local marker="$1"
  if grep -qxF -- "${marker}" "${route_trace}"; then
    echo "[test] unexpected pre-commit route marker: ${marker}" >&2
    cat "${route_output}" >&2
    exit 1
  fi
}

stage_and_run_hook() {
  local path="$1"
  printf '\n' >>"${route_repo}/${path}"
  git -C "${route_repo}" add "${path}"
  : >"${route_trace}"
  if ! (cd "${route_repo}" && HOOK_TRACE="${route_trace}" bash .githooks/pre-commit) >"${route_output}" 2>&1; then
    echo "[test] expected pre-commit hook to pass for: ${path}" >&2
    cat "${route_output}" >&2
    exit 1
  fi
}

restore_route_fixture() {
  local path="$1"
  git -C "${route_repo}" restore --staged --worktree -- "${path}"
}

git -c init.defaultBranch=main init -q "${route_repo}"
git -C "${route_repo}" config user.email pre-commit-route@example.invalid
git -C "${route_repo}" config user.name 'Pre-commit Route Test'
mkdir -p "${route_repo}/.githooks"
cp "${repo_root}/.githooks/pre-commit" "${route_repo}/.githooks/pre-commit"
chmod +x "${route_repo}/.githooks/pre-commit"

for guard in check-forbidden-tracked-files.sh check-current-task-state.sh check-current-task-scope.sh; do
  write_shell_stub "${route_repo}/tools/guards/${guard}"
done
write_node_stub "${route_repo}/tools/repo-boundary/check-platform-boundary.mjs"
write_shell_stub "${route_repo}/back/gradlew" 'public-gradle'
write_node_stub "${route_repo}/tools/contracts/sync-public-contracts.mjs" 'public-sync'
write_node_stub "${route_repo}/tools/contracts/write-public-manifest.mjs"
write_node_stub "${route_repo}/tools/contracts/check-web-policy-lock.mjs" 'web-policy-check'
write_node_stub "${route_repo}/tools/contracts/import-web-policy-manifest.mjs"
write_node_stub "${route_repo}/tools/test/public-contract-manifest.test.mjs"
write_node_stub "${route_repo}/tools/test/web-policy-contract.test.mjs" 'web-policy-test'
write_node_stub "${route_repo}/tools/test/web-legal-policy-workflow.test.mjs" 'receiver-test'
write_node_stub "${route_repo}/tools/ci/verify-test-execution-inventory.mjs" 'inventory-test'
write_shell_stub "${route_repo}/tools/test/hook-drift-guard.test.sh" 'hook-route-test'

mkdir -p \
  "${route_repo}/.github/workflows" \
  "${route_repo}/back/gradle" \
  "${route_repo}/back/src/main/resources" \
  "${route_repo}/contracts/public-api" \
  "${route_repo}/contracts/web" \
  "${route_repo}/tools/test"
printf 'name: CI\n' >"${route_repo}/.github/workflows/ci.yml"
printf 'name: Receiver\n' >"${route_repo}/.github/workflows/sync-web-legal-policy-to-platform.yml"
printf '// fixture\n' >"${route_repo}/back/gradle/backend-test-infra.gradle.kts"
printf 'spring: {}\n' >"${route_repo}/back/src/main/resources/application.yml"
printf '{}\n' >"${route_repo}/contracts/public-api/openapi.json"
printf '{}\n' >"${route_repo}/contracts/public-api/error-codes.json"
printf '{}\n' >"${route_repo}/contracts/public-api/manifest.json"
printf '{}\n' >"${route_repo}/contracts/web/legal-policy-manifest.lock.json"
printf '{}\n' >"${route_repo}/tools/test/test-execution-inventory.json"
git -C "${route_repo}" add .
git -C "${route_repo}" commit -qm 'test: pre-commit routing fixture'

# Web legal-policy changes run their focused contract checks without the public API exporter.
stage_and_run_hook 'contracts/web/legal-policy-manifest.lock.json'
assert_route_marker 'web-policy-test'
assert_route_marker 'web-policy-check'
assert_no_route_marker 'public-gradle'
assert_no_route_marker 'public-sync'
restore_route_fixture 'contracts/web/legal-policy-manifest.lock.json'

# The receiver and execution inventory each run only their own deterministic check.
stage_and_run_hook '.github/workflows/sync-web-legal-policy-to-platform.yml'
assert_route_marker 'receiver-test'
assert_no_route_marker 'public-gradle'
restore_route_fixture '.github/workflows/sync-web-legal-policy-to-platform.yml'

stage_and_run_hook 'tools/test/test-execution-inventory.json'
assert_route_marker 'inventory-test'
assert_no_route_marker 'public-gradle'
restore_route_fixture 'tools/test/test-execution-inventory.json'

# General CI wiring verifies its execution inventory without invoking the public exporter.
stage_and_run_hook '.github/workflows/ci.yml'
assert_route_marker 'inventory-test'
assert_route_marker 'receiver-test'
assert_no_route_marker 'public-gradle'
assert_no_route_marker 'public-sync'
restore_route_fixture '.github/workflows/ci.yml'

# Hook routing changes self-validate without invoking the public exporter.
stage_and_run_hook '.githooks/pre-commit'
assert_route_marker 'hook-route-test'
assert_no_route_marker 'public-gradle'
restore_route_fixture '.githooks/pre-commit'

stage_and_run_hook 'tools/test/hook-drift-guard.test.sh'
assert_route_marker 'hook-route-test'
assert_no_route_marker 'public-gradle'
restore_route_fixture 'tools/test/hook-drift-guard.test.sh'

# A real public contract producer retains the full export and tracked-diff gate.
stage_and_run_hook 'tools/contracts/sync-public-contracts.mjs'
assert_route_marker 'public-gradle'
assert_route_marker 'public-sync'
assert_no_route_marker 'web-policy-test'
assert_no_route_marker 'receiver-test'
assert_no_route_marker 'inventory-test'
restore_route_fixture 'tools/contracts/sync-public-contracts.mjs'

# Bash case matching intentionally covers nested main resources; exporter test infra is exact.
stage_and_run_hook 'back/src/main/resources/application.yml'
assert_route_marker 'public-gradle'
assert_route_marker 'public-sync'
restore_route_fixture 'back/src/main/resources/application.yml'

stage_and_run_hook 'back/gradle/backend-test-infra.gradle.kts'
assert_route_marker 'public-gradle'
assert_route_marker 'public-sync'
restore_route_fixture 'back/gradle/backend-test-infra.gradle.kts'

echo '[test] hook drift guard passed'
