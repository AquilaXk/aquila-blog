#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

guard="tools/guards/check-forbidden-tracked-files.sh"
readme_blob="$(git rev-parse HEAD:README.md)"
guard_output="$(mktemp)"
trap 'rm -f "${guard_output}"' EXIT

run_with_temp_index() {
  local command="$1"
  local tmp_index
  tmp_index="$(mktemp)"
  GIT_INDEX_FILE="${tmp_index}" git read-tree HEAD
  set +e
  GIT_INDEX_FILE="${tmp_index}" bash -c "${command}"
  local status=$?
  set -e
  rm -f "${tmp_index}"
  return "${status}"
}

if ! bash "${guard}"; then
  echo "[test] expected current tracked files to pass forbidden-doc guard" >&2
  exit 1
fi

if run_with_temp_index "git update-index --add --cacheinfo 100644 '${readme_blob}' docs/leak.md && bash '${guard}' >'${guard_output}' 2>&1"; then
  echo "[test] expected tracked docs/leak.md to be rejected" >&2
  exit 1
fi

if ! run_with_temp_index "git update-index --add --cacheinfo 100644 '${readme_blob}' docs/design/contract.md && bash '${guard}' >'${guard_output}' 2>&1"; then
  echo "[test] expected tracked docs/design/contract.md to be allowed" >&2
  exit 1
fi

if run_with_temp_index "git update-index --add --cacheinfo 100644 '${readme_blob}' back/new-report.md && bash '${guard}' >'${guard_output}' 2>&1"; then
  echo "[test] expected tracked back/new-report.md to be rejected" >&2
  exit 1
fi

if run_with_temp_index "git update-index --add --cacheinfo 100644 '${readme_blob}' docs/leak.md && bash '${guard}' --staged >'${guard_output}' 2>&1"; then
  echo "[test] expected staged docs/leak.md to be rejected" >&2
  exit 1
fi

if ! run_with_temp_index "git update-index --add --cacheinfo 100644 '${readme_blob}' docs/design/contract.md && bash '${guard}' --staged >'${guard_output}' 2>&1"; then
  echo "[test] expected staged docs/design/contract.md to be allowed" >&2
  exit 1
fi

echo "[test] forbidden tracked docs guard passed"
