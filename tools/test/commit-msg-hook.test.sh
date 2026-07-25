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

# The Hangul rule only works when the hook pins the collation locale, so a run where no
# UTF-8 locale is installed proves nothing. Pick a locale that this machine really has and
# skip (loudly) the cases whose locale is missing.
available_locales="$(locale -a 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d '_-')"

locale_available() {
  local want
  want="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '_-')"
  printf '%s\n' "${available_locales}" | grep -qxF -- "${want}"
}

base_locale=""
for candidate in C.UTF-8 en_US.UTF-8 ko_KR.UTF-8; do
  if locale_available "${candidate}"; then
    base_locale="${candidate}"
    break
  fi
done
if [ -z "${base_locale}" ]; then
  echo "[test] no UTF-8 locale is installed, so the locale guard cannot be exercised" >&2
  exit 1
fi

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

expect_accepted_in_locale() {
  local required="$1"
  local label="$2"
  local subject="$3"
  shift 3
  if ! locale_available "${required}"; then
    echo "[test] skip: ${label} (locale ${required} is not installed on this machine)"
    return 0
  fi
  expect_accepted "${label}" "${subject}" "$@"
}

reason_format="[commit-msg] 커밋 메시지 규칙 위반"
reason_hangul="제목에는 한글이 최소 1자 이상 포함되어야 합니다."
reason_english="제목에는 영문 키워드가 최소 1자 이상 포함되어야 합니다."

mixed_subject="fix(hooks): 커밋 메시지 검사 locale guard 수정"

clear_filter

# C.UTF-8 is present on every Linux runner and reproduces the collation regression, so it is
# the case that actually guards the LC_ALL pin.
expect_accepted_in_locale C.UTF-8 "ko+en subject under LANG=C.UTF-8" "${mixed_subject}" LANG=C.UTF-8
expect_accepted_in_locale C.UTF-8 "ko+en subject under LC_ALL=C.UTF-8" "${mixed_subject}" LC_ALL=C.UTF-8
expect_accepted_in_locale ko_KR.UTF-8 "ko+en subject under LANG=ko_KR.UTF-8" "${mixed_subject}" LANG=ko_KR.UTF-8
expect_accepted_in_locale ko_KR.UTF-8 "ko+en subject under LC_COLLATE=ko_KR.UTF-8" "${mixed_subject}" LANG=ko_KR.UTF-8 LC_COLLATE=ko_KR.UTF-8
expect_accepted_in_locale ko_KR.UTF-8 "ko+en subject under LC_ALL=ko_KR.UTF-8" "${mixed_subject}" LC_ALL=ko_KR.UTF-8
expect_accepted_in_locale en_US.UTF-8 "ko+en subject under LANG=en_US.UTF-8" "${mixed_subject}" LANG=en_US.UTF-8

expect_rejected "english-only subject" "${reason_hangul}" \
  "fix(hooks): commit message locale guard" LANG="${base_locale}"
expect_rejected "hangul-only subject" "${reason_english}" \
  "fix(hooks): 커밋 메시지 검사 강화" LANG="${base_locale}"
expect_rejected "subject without conventional type" "${reason_format}" \
  "커밋 메시지 locale guard 수정" LANG="${base_locale}"

# Under LC_ALL=C a [가-힣] range matches any non-ASCII byte, so non-Hangul scripts must not
# be mistaken for Hangul.
expect_rejected "latin-1 accent instead of hangul" "${reason_hangul}" \
  "fix(hooks): café guard update" LANG="${base_locale}"
expect_rejected "japanese instead of hangul" "${reason_hangul}" \
  "fix(hooks): 日本語 guard update" LANG="${base_locale}"
expect_rejected "cyrillic instead of hangul" "${reason_hangul}" \
  "fix(hooks): Привет guard update" LANG="${base_locale}"
expect_rejected "emoji instead of hangul" "${reason_hangul}" \
  "fix(hooks): 🚀 guard update" LANG="${base_locale}"
expect_accepted "non-ascii summary that also has hangul" \
  "fix(hooks): café 캐시 guard 수정" LANG="${base_locale}"

expect_accepted "merge commit subject" "Merge pull request #1 from AquilaXk/topic" LANG="${base_locale}"
expect_accepted "revert commit subject" "Revert \"fix(hooks): 커밋 메시지 검사 locale guard 수정\"" LANG="${base_locale}"
expect_accepted "fixup commit subject" "fixup! ${mixed_subject}" LANG="${base_locale}"
expect_accepted "squash commit subject" "squash! ${mixed_subject}" LANG="${base_locale}"
expect_accepted "amend commit subject" "amend! ${mixed_subject}" LANG="${base_locale}"

# The subject is the first line git would keep, not literally the first line of the file.
printf '%s\n' "" "   " "# 주석 줄은 제목이 아니다" "${mixed_subject}" > "${msg_file}"
expect_accepted_message "subject after blank and comment lines" LANG="${base_locale}"

printf '%s\n' "" "# 주석 줄은 제목이 아니다" "커밋 메시지 locale guard 수정" > "${msg_file}"
expect_rejected_message "invalid subject after blank and comment lines" "${reason_format}" LANG="${base_locale}"

git -C "${sandbox}" config core.commentChar ";"
printf '%s\n' "; 세미콜론 주석" "${mixed_subject}" > "${msg_file}"
expect_accepted_message "subject after a core.commentChar comment" LANG="${base_locale}"
printf '%s\n' "# 이제 해시는 주석이 아니다" "${mixed_subject}" > "${msg_file}"
expect_rejected_message "hash line is a subject when core.commentChar is ;" "${reason_format}" LANG="${base_locale}"
git -C "${sandbox}" config --unset core.commentChar

# hooks.commitMsgFilter is an optional per-machine script: unset, missing, present,
# non-executable, and failing must all leave the commit message rules working.
clear_filter
rm -f "${filter_marker}"
expect_accepted "ko+en subject without a configured filter" "${mixed_subject}" LANG="${base_locale}"
if [ -e "${filter_marker}" ]; then
  echo "[test] expected no filter to run when hooks.commitMsgFilter is unset" >&2
  exit 1
fi

set_filter "${missing_filter}"
rm -f "${filter_marker}"
expect_accepted "ko+en subject with a filter path that does not exist" "${mixed_subject}" LANG="${base_locale}"
if [ -e "${filter_marker}" ]; then
  echo "[test] expected no filter to run when the configured path is missing" >&2
  exit 1
fi

set_filter "${recording_filter}"
rm -f "${filter_marker}"
expect_accepted "ko+en subject with a configured filter" "${mixed_subject}" LANG="${base_locale}"
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
expect_accepted "ko+en subject with a non-executable filter" "${mixed_subject}" LANG="${base_locale}"
if [ -e "${filter_marker}" ]; then
  echo "[test] expected the hook to skip a non-executable filter" >&2
  exit 1
fi

set_filter "${failing_filter}"
rm -f "${filter_marker}"
expect_accepted "ko+en subject with a failing filter" "${mixed_subject}" LANG="${base_locale}"
if [ ! -e "${filter_marker}" ]; then
  echo "[test] expected the failing filter to have run" >&2
  exit 1
fi
if ! grep -qF -- "hooks.commitMsgFilter 실행 실패" "${hook_output}"; then
  echo "[test] expected a warning when the configured filter fails" >&2
  cat "${hook_output}" >&2
  exit 1
fi
expect_rejected "english-only subject with a failing filter" "${reason_hangul}" \
  "fix(hooks): commit message locale guard" LANG="${base_locale}"
clear_filter

echo "[test] commit-msg hook rules passed"
