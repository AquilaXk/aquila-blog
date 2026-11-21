#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

script="tools/repo-split/capture-baseline.sh"
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

fail() {
  echo "[test] $1" >&2
  exit 1
}

run_capture() {
  local name="$1"
  shift

  set +e
  bash "${script}" "$@" >"${workdir}/${name}.out" 2>"${workdir}/${name}.err"
  capture_status=$?
  set -e
}

run_capture_with_index() {
  local name="$1"
  local index_file="$2"
  shift 2

  set +e
  GIT_INDEX_FILE="${index_file}" bash "${script}" "$@" >"${workdir}/${name}.out" 2>"${workdir}/${name}.err"
  capture_status=$?
  set -e
}

require_failure() {
  local name="$1"
  local expected_message="$2"

  if [ "${capture_status}" -eq 0 ]; then
    fail "${name} must fail"
  fi
  if ! grep -Fq "${expected_message}" "${workdir}/${name}.err"; then
    fail "${name} did not report: ${expected_message}"
  fi
}

if [ ! -f "${script}" ]; then
  fail "${script} is missing from the repository checkout"
fi

run_capture missing-expected-sha
require_failure missing-expected-sha "usage:"

run_capture invalid-expected-sha --expected-sha not-a-sha
require_failure invalid-expected-sha "must be a 40-hex SHA"

run_capture stale-origin-main --expected-sha 0000000000000000000000000000000000000000
require_failure stale-origin-main "origin/main does not match expected SHA"

expected_sha="$(git rev-parse origin/main)"
run_capture clean --expected-sha "${expected_sha}"
if [ "${capture_status}" -ne 0 ]; then
  cat "${workdir}/clean.err" >&2
  fail "matching origin/main must capture the baseline"
fi

for key in split_base_sha tracked_front_files tracked_back_files tracked_deploy_files size_pack; do
  if ! grep -Eq "^${key}=" "${workdir}/clean.out"; then
    fail "clean baseline output is missing ${key}"
  fi
done

if ! grep -Fxq "split_base_sha=${expected_sha}" "${workdir}/clean.out"; then
  fail "clean baseline must report the expected origin/main SHA"
fi

origin_front_files="$(git ls-tree -r --name-only "${expected_sha}" -- front | wc -l | tr -d '[:space:]')"
index_blob="$(git rev-parse HEAD:README.md)"
different_index="${workdir}/different-index"
GIT_INDEX_FILE="${different_index}" git read-tree HEAD
GIT_INDEX_FILE="${different_index}" git update-index --add --cacheinfo "100644,${index_blob},front/.baseline-index-regression"

run_capture_with_index origin-tree-count "${different_index}" --expected-sha "${expected_sha}"
if [ "${capture_status}" -ne 0 ]; then
  cat "${workdir}/origin-tree-count.err" >&2
  fail "baseline capture must work with an index that differs from origin/main"
fi
if ! grep -Fxq "tracked_front_files=${origin_front_files}" "${workdir}/origin-tree-count.out"; then
  fail "tracked front count must remain pinned to the origin/main tree"
fi

echo "[test] repository split baseline passed"
