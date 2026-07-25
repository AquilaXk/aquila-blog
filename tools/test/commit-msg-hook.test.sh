#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

# .githooks/commit-msg is a developer-local hook (gitignored), so it is absent on a
# fresh clone. Fail loudly instead of silently passing without exercising anything.
hook=".githooks/commit-msg"
if [ ! -f "${hook}" ]; then
  echo "[test] ${hook} is missing; install the local commit-msg hook before running this test" >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

msg_file="${workdir}/COMMIT_EDITMSG"
hook_output="${workdir}/hook-output"

# The hook delegates attribution stripping to a developer-local script; stub it so the
# test only exercises the commit message rules and stays runnable on CI.
stub_home="${workdir}/home"
mkdir -p "${stub_home}/.cursor/hooks"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "${stub_home}/.cursor/hooks/strip-cursor-attribution.sh"

run_hook() {
  local subject="$1"
  shift
  printf '%s\n' "${subject}" > "${msg_file}"
  set +e
  env -u LANG -u LANGUAGE -u LC_ALL -u LC_COLLATE -u LC_CTYPE \
    "$@" HOME="${stub_home}" bash "${hook}" "${msg_file}" >"${hook_output}" 2>&1
  local status=$?
  set -e
  return "${status}"
}

expect_accepted() {
  local label="$1"
  shift
  if ! run_hook "$@"; then
    echo "[test] expected hook to accept: ${label}" >&2
    cat "${hook_output}" >&2
    exit 1
  fi
}

expect_rejected() {
  local label="$1"
  shift
  if run_hook "$@"; then
    echo "[test] expected hook to reject: ${label}" >&2
    exit 1
  fi
}

mixed_subject="fix(hooks): 커밋 메시지 검사 locale guard 수정"

expect_accepted "ko+en subject under LANG=ko_KR.UTF-8" "${mixed_subject}" LANG=ko_KR.UTF-8
expect_accepted "ko+en subject under LC_COLLATE=ko_KR.UTF-8" "${mixed_subject}" LANG=ko_KR.UTF-8 LC_COLLATE=ko_KR.UTF-8
expect_accepted "ko+en subject under LC_ALL=ko_KR.UTF-8" "${mixed_subject}" LC_ALL=ko_KR.UTF-8
expect_accepted "ko+en subject under LANG=en_US.UTF-8" "${mixed_subject}" LANG=en_US.UTF-8

expect_rejected "english-only subject" "fix(hooks): commit message locale guard" LANG=ko_KR.UTF-8
expect_rejected "subject without conventional type" "커밋 메시지 locale guard 수정" LANG=ko_KR.UTF-8

expect_accepted "merge commit subject" "Merge pull request #1 from AquilaXk/topic" LANG=ko_KR.UTF-8

echo "[test] commit-msg hook rules passed"
