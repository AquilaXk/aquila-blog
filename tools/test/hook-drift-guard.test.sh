#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
guard_path="${repo_root}/tools/guards/check-hook-drift.sh"

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

echo '[test] hook drift guard passed'
