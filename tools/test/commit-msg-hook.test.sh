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

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

msg_file="${workdir}/COMMIT_EDITMSG"
hook_output="${workdir}/hook-output"
strip_marker="${workdir}/strip-invoked"

# The attribution stripper is a developer-local script that lives outside the
# repository. Default every case to a HOME without it so the rule checks prove the hook
# still runs where the optional dependency is absent (CI, fresh clones).
home_without_helper="${workdir}/home-without-helper"
mkdir -p "${home_without_helper}"

helper_path=".cursor/hooks/strip-cursor-attribution.sh"

home_with_helper="${workdir}/home-with-helper"
mkdir -p "${home_with_helper}/$(dirname "${helper_path}")"
cat > "${home_with_helper}/${helper_path}" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$1" > "${STRIP_MARKER}"
STUB
chmod +x "${home_with_helper}/${helper_path}"

# Same helper without the executable bit: the hook must skip it instead of failing.
home_with_unexecutable_helper="${workdir}/home-with-unexecutable-helper"
mkdir -p "${home_with_unexecutable_helper}/$(dirname "${helper_path}")"
cp "${home_with_helper}/${helper_path}" "${home_with_unexecutable_helper}/${helper_path}"
chmod -x "${home_with_unexecutable_helper}/${helper_path}"

hook_home="${home_without_helper}"

run_hook() {
  local subject="$1"
  shift
  printf '%s\n' "${subject}" > "${msg_file}"
  set +e
  env -u LANG -u LANGUAGE -u LC_ALL -u LC_COLLATE -u LC_CTYPE \
    "$@" HOME="${hook_home}" STRIP_MARKER="${strip_marker}" \
    bash "${hook}" "${msg_file}" >"${hook_output}" 2>&1
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

# The attribution stripper is optional: absent, present, and present-but-not-executable
# must all leave the commit message rules working.
rm -f "${strip_marker}"
expect_accepted "ko+en subject without the attribution helper" "${mixed_subject}" LANG=ko_KR.UTF-8
if [ -e "${strip_marker}" ]; then
  echo "[test] expected no attribution helper to run when it is not installed" >&2
  exit 1
fi

hook_home="${home_with_helper}"
expect_accepted "ko+en subject with the attribution helper installed" "${mixed_subject}" LANG=ko_KR.UTF-8
if [ ! -e "${strip_marker}" ]; then
  echo "[test] expected the hook to run the installed attribution helper" >&2
  exit 1
fi
if [ "$(cat "${strip_marker}")" != "${msg_file}" ]; then
  echo "[test] expected the attribution helper to receive the commit message file" >&2
  exit 1
fi

rm -f "${strip_marker}"
hook_home="${home_with_unexecutable_helper}"
expect_accepted "ko+en subject with a non-executable attribution helper" "${mixed_subject}" LANG=ko_KR.UTF-8
if [ -e "${strip_marker}" ]; then
  echo "[test] expected the hook to skip a non-executable attribution helper" >&2
  exit 1
fi

echo "[test] commit-msg hook rules passed"
