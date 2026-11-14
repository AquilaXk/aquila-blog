#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

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
validation_locale=C
available_locales=$'\n'"$(locale -a 2>/dev/null)"$'\n'
if [[ "${available_locales}" == *$'\nC.UTF-8\n'* ]]; then
  validation_locale=C.UTF-8
elif [[ "${available_locales}" == *$'\nC.utf8\n'* ]]; then
  validation_locale=C.utf8
fi

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

msg_file="${workdir}/COMMIT_EDITMSG"
hook_output="${workdir}/hook-output"
filter_marker="${workdir}/filter-invoked"

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

reason_format="[commit-msg] commit message format violation"

english_subject="fix(hooks): allow concise English commit subjects"
korean_bracket_subject="[Chore] 1인 프로젝트 방식으로 전환"

clear_filter

expect_accepted "English conventional subject" "${english_subject}" LANG="${base_locale}"
expect_accepted "Korean conventional subject" "fix(hooks): 커밋 메시지 검사 정리" LANG="${validation_locale}"
expect_accepted "Korean bracket subject" "${korean_bracket_subject}" LANG="${validation_locale}"
expect_accepted "English bracket subject" "[Fix] relax steady-state guard cron schedule" LANG="${base_locale}"
expect_rejected "subject without type prefix" "${reason_format}" \
  "missing conventional type" LANG="${base_locale}"

expect_accepted "merge commit subject" "Merge pull request #1 from AquilaXk/topic" LANG="${base_locale}"
expect_accepted "revert commit subject" "Revert \"${english_subject}\"" LANG="${base_locale}"
expect_accepted "fixup commit subject" "fixup! ${english_subject}" LANG="${base_locale}"
expect_accepted "squash commit subject" "squash! ${english_subject}" LANG="${base_locale}"
expect_accepted "amend commit subject" "amend! ${english_subject}" LANG="${base_locale}"

printf '%s\n' "" "   " "# comment lines are not subjects" "${english_subject}" > "${msg_file}"
expect_accepted_message "subject after blank and comment lines" LANG="${base_locale}"

printf '%s\n' $'\u2003' "${english_subject}" > "${msg_file}"
expect_rejected_message "UTF-8 whitespace is not treated as a blank subject line" "${reason_format}" LANG="${validation_locale}"

printf '%s\n' "" "# comment lines are not subjects" "missing conventional type" > "${msg_file}"
expect_rejected_message "invalid subject after blank and comment lines" "${reason_format}" LANG="${base_locale}"

git -C "${sandbox}" config core.commentChar ";"
printf '%s\n' "; comment line" "${english_subject}" > "${msg_file}"
expect_accepted_message "subject after a core.commentChar comment" LANG="${base_locale}"
printf '%s\n' "# hash is a subject when the comment character is semicolon" "${english_subject}" > "${msg_file}"
expect_rejected_message "hash line is a subject when core.commentChar is ;" "${reason_format}" LANG="${base_locale}"
git -C "${sandbox}" config --unset core.commentChar

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
expect_rejected "English subject with a failing filter fails closed" "hooks.commitMsgFilter 실행 실패" \
  "${english_subject}" LANG="${base_locale}"
if [ ! -e "${filter_marker}" ]; then
  echo "[test] expected the failing filter to have run" >&2
  exit 1
fi
clear_filter

printf '%s\n\n%s\n' "${english_subject}" "Validate full body lines without disallowed trailers." > "${msg_file}"
expect_accepted_message "multi-line commit body with clean prose" LANG="${base_locale}"

co_author_trailer="$(printf '%s-%s-%s: automated <dev@example.com>' 'Co' 'Authored' 'By')"
generated_trailer="$(printf '%s %s build tool' 'Generated' 'with')"
reason_trailer="[commit-msg] 허용되지 않는 공동 작성 또는 자동 생성 트레일러"

printf '%s\n\n%s\n' "${english_subject}" "${co_author_trailer}" > "${msg_file}"
expect_rejected_message "multi-line commit body with co-author trailer" "${reason_trailer}" LANG="${base_locale}"

printf '%s\n\n%s\n' "${english_subject}" "${generated_trailer}" > "${msg_file}"
expect_rejected_message "multi-line commit body with generated attribution footer" "${reason_trailer}" LANG="${base_locale}"

echo "[test] commit-msg hook rules passed"
