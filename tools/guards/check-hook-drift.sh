#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
expected_hooks_dir="${repo_root}/.githooks"
sync_guidance='[hook-drift] sync with: git config core.hooksPath .githooks'

fail() {
  echo "[hook-drift] $1" >&2
  echo "${sync_guidance}" >&2
  exit 1
}

if ! configured_hooks_path="$(git config --get core.hooksPath)"; then
  fail 'core.hooksPath is unset; tracked hooks must be configured repository-relatively.'
fi

if [[ "${configured_hooks_path}" == /* ]]; then
  fail "core.hooksPath must not be absolute: ${configured_hooks_path}"
fi

effective_hooks_dir="$(git rev-parse --path-format=absolute --git-path hooks)"
if [[ "${effective_hooks_dir}" != "${expected_hooks_dir}" ]]; then
  fail "effective hooks directory differs from this worktree: ${effective_hooks_dir}"
fi

for hook in commit-msg pre-commit pre-push; do
  hook_path="${expected_hooks_dir}/${hook}"
  if [[ ! -f "${hook_path}" ]]; then
    fail "tracked hook is missing: .githooks/${hook}"
  fi
  if [[ ! -x "${hook_path}" ]]; then
    fail "tracked hook is not executable: .githooks/${hook}"
  fi
done

echo "[hook-drift] ok: tracked hooks match this worktree"
