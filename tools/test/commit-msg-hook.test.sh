#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

# .githooks/commit-msg is tracked, so a missing file means the checkout is incomplete
# rather than a developer-local setup step being skipped.
hook=".githooks/commit-msg"
if [ ! -f "${hook}" ]; then
  echo "[test] ${hook} is missing from the repository checkout" >&2
  exit 1
fi
if [ ! -x "${hook}" ]; then
  echo "[test] ${hook} must stay executable for core.hooksPath to run it" >&2
  exit 1
fi
hook_path="${repo_root}/${hook}"

base_locale=C

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

msg_file="${workdir}/COMMIT_EDITMSG"
hook_output="${workdir}/hook-output"
filter_marker="${workdir}/filter-invoked"

# The hook reads hooks.commitMsgFilter and core.commentChar from git config, so run it in a
# throwaway repository instead of this checkout: no developer setting leaks into the run and
# nothing is written back here.
sandbox="${workdir}/sandbox"
mkdir -p "${sandbox}"
git -c init.defaultBranch=main init -q "${sandbox}"

filters="${workdir}/filters"
mkdir -p "${filters}"

recording_filter="${filters}/recording-filter.sh"
cat > "${recording_filter}" <<'STUB'
#!/usr/bin/env bash
{
  printf '%s\n' "$1"
  printf 'LC_ALL=%s\n' "${LC_ALL-unset}"
  printf 'LANG=%s\n' "${LANG-unset}"
} > "${STRIP_MARKER}"
STUB
chmod +x "${recording_filter}"

# Same filter without the executable bit: the hook must skip it instead of failing.
unexecutable_filter="${filters}/unexecutable-filter.sh"
cp "${recording_filter}" "${unexecutable_filter}"
chmod -x "${unexecutable_filter}"

failing_filter="${filters}/failing-filter.sh"
cat > "${failing_filter}" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$1" > "${STRIP_MARKER}"
exit 1
STUB
chmod +x "${failing_filter}"

missing_filter="${filters}/not-installed-filter.sh"

set_filter() {
  git -C "${sandbox}" config hooks.commitMsgFilter "$1"
}

clear_filter() {
  git -C "${sandbox}" config --unset-all hooks.commitMsgFilter || true
}

run_hook_message() {
  set +e
  (
    cd "${sandbox}" &&
      env -u LANG -u LANGUAGE -u LC_ALL -u LC_COLLATE -u LC_CTYPE \
        GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
        "$@" STRIP_MARKER="${filter_marker}" \
        bash "${hook_path}" "${msg_file}"
  ) >"${hook_output}" 2>&1
  local status=$?
  set -e
  return "${status}"
}

run_hook() {
  local subject="$1"
  shift
  printf '%s\n' "${subject}" > "${msg_file}"
  run_hook_message "$@"
}

expect_accepted_message() {
  local label="$1"
  shift
  if ! run_hook_message "$@"; then
    echo "[test] expected hook to accept: ${label}" >&2
    cat "${hook_output}" >&2
    exit 1
  fi
}

expect_rejected_message() {
  local label="$1"
  local reason="$2"
  shift 2
  if run_hook_message "$@"; then
    echo "[test] expected hook to reject: ${label}" >&2
    exit 1
  fi
  if ! grep -qF -- "${reason}" "${hook_output}"; then
    echo "[test] expected rejection reason \"${reason}\" for: ${label}" >&2
    cat "${hook_output}" >&2
    exit 1
  fi
}

expect_accepted() {
  local label="$1"
  local subject="$2"
  shift 2
  printf '%s\n' "${subject}" > "${msg_file}"
  expect_accepted_message "${label}" "$@"
}

expect_rejected() {
  local label="$1"
  local reason="$2"
  local subject="$3"
  shift 3
  printf '%s\n' "${subject}" > "${msg_file}"
  expect_rejected_message "${label}" "${reason}" "$@"
}

reason_format="[commit-msg] 커밋 메시지 규칙 위반"

english_subject="fix(hooks): allow concise English commit subjects"

clear_filter

expect_accepted "English conventional subject" "${english_subject}" LANG="${base_locale}"
expect_accepted "Korean conventional subject" \
  "fix(hooks): 커밋 메시지 검사 강화" LANG="${base_locale}"
expect_rejected "subject without conventional type" "${reason_format}" \
  "커밋 메시지 locale guard 수정" LANG="${base_locale}"

expect_accepted "merge commit subject" "Merge pull request #1 from AquilaXk/topic" LANG="${base_locale}"
expect_accepted "revert commit subject" "Revert \"${english_subject}\"" LANG="${base_locale}"
expect_accepted "fixup commit subject" "fixup! ${english_subject}" LANG="${base_locale}"
expect_accepted "squash commit subject" "squash! ${english_subject}" LANG="${base_locale}"
expect_accepted "amend commit subject" "amend! ${english_subject}" LANG="${base_locale}"

# The subject is the first line git would keep, not literally the first line of the file.
printf '%s\n' "" "   " "# comment lines are not subjects" "${english_subject}" > "${msg_file}"
expect_accepted_message "subject after blank and comment lines" LANG="${base_locale}"

printf '%s\n' "" "# 주석 줄은 제목이 아니다" "커밋 메시지 locale guard 수정" > "${msg_file}"
expect_rejected_message "invalid subject after blank and comment lines" "${reason_format}" LANG="${base_locale}"

git -C "${sandbox}" config core.commentChar ";"
printf '%s\n' "; comment line" "${english_subject}" > "${msg_file}"
expect_accepted_message "subject after a core.commentChar comment" LANG="${base_locale}"
printf '%s\n' "# hash is a subject when the comment character is semicolon" "${english_subject}" > "${msg_file}"
expect_rejected_message "hash line is a subject when core.commentChar is ;" "${reason_format}" LANG="${base_locale}"
git -C "${sandbox}" config --unset core.commentChar

# hooks.commitMsgFilter is an optional per-machine script: unset, missing, present,
# non-executable, and failing must all leave the commit message rules working.
clear_filter
rm -f "${filter_marker}"
expect_accepted "English subject without a configured filter" "${english_subject}" LANG="${base_locale}"
if [ -e "${filter_marker}" ]; then
  echo "[test] expected no filter to run when hooks.commitMsgFilter is unset" >&2
  exit 1
fi

set_filter "${missing_filter}"
rm -f "${filter_marker}"
expect_accepted "English subject with a filter path that does not exist" "${english_subject}" LANG="${base_locale}"
if [ -e "${filter_marker}" ]; then
  echo "[test] expected no filter to run when the configured path is missing" >&2
  exit 1
fi

set_filter "${recording_filter}"
rm -f "${filter_marker}"
expect_accepted "English subject with a configured filter" "${english_subject}" LANG="${base_locale}"
if [ ! -e "${filter_marker}" ]; then
  echo "[test] expected the hook to run the configured hooks.commitMsgFilter" >&2
  exit 1
fi
if [ "$(sed -n '1p' "${filter_marker}")" != "${msg_file}" ]; then
  echo "[test] expected the filter to receive the commit message file" >&2
  exit 1
fi
# The filter must not inherit the hook's LC_ALL=C pin, which exists only for the rule checks.
if ! grep -qxF "LC_ALL=unset" "${filter_marker}"; then
  echo "[test] expected the filter to run without the hook's LC_ALL pin" >&2
  cat "${filter_marker}" >&2
  exit 1
fi
if ! grep -qxF "LANG=${base_locale}" "${filter_marker}"; then
  echo "[test] expected the filter to keep the caller's locale" >&2
  cat "${filter_marker}" >&2
  exit 1
fi

set_filter "${unexecutable_filter}"
rm -f "${filter_marker}"
expect_accepted "English subject with a non-executable filter" "${english_subject}" LANG="${base_locale}"
if [ -e "${filter_marker}" ]; then
  echo "[test] expected the hook to skip a non-executable filter" >&2
  exit 1
fi

set_filter "${failing_filter}"
rm -f "${filter_marker}"
expect_accepted "English subject with a failing filter" "${english_subject}" LANG="${base_locale}"
if [ ! -e "${filter_marker}" ]; then
  echo "[test] expected the failing filter to have run" >&2
  exit 1
fi
if ! grep -qF -- "hooks.commitMsgFilter 실행 실패" "${hook_output}"; then
  echo "[test] expected a warning when the configured filter fails" >&2
  cat "${hook_output}" >&2
  exit 1
fi
expect_rejected "invalid subject with a failing filter" "${reason_format}" \
  "commit message without type" LANG="${base_locale}"
clear_filter

echo "[test] commit-msg hook rules passed"
