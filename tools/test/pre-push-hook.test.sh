#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

hook=".githooks/pre-push"
if [ ! -f "${hook}" ]; then
  echo "[test] ${hook} is missing from the repository checkout" >&2
  exit 1
fi
if [ ! -x "${hook}" ]; then
  echo "[test] ${hook} must stay executable for core.hooksPath to run it" >&2
  exit 1
fi
hook_path="${repo_root}/${hook}"

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT
hook_output="${workdir}/hook-output"

sha="1111111111111111111111111111111111111111"
zero_sha="0000000000000000000000000000000000000000"

if ! grep -qxF 'export LC_ALL=C' "${hook_path}"; then
  echo "[test] ${hook} must pin LC_ALL so its character ranges ignore the caller's collation" >&2
  exit 1
fi

available_locales="$(locale -a 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -d '_-')"

locale_available() {
  local want
  want="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '_-')"
  printf '%s\n' "${available_locales}" | grep -qxF -- "${want}"
}

hook_locale="C"

run_hook() {
  local payload="$1"
  set +e
  printf '%s\n' "${payload}" \
    | env -u LANG -u LANGUAGE -u LC_ALL -u LC_COLLATE -u LC_CTYPE LC_ALL="${hook_locale}" \
      bash "${hook_path}" origin https://github.com/AquilaXk/aquila-blog.git \
      >"${hook_output}" 2>&1
  local status=$?
  set -e
  return "${status}"
}

expect_allowed() {
  local label="$1"
  local payload="$2"
  if ! run_hook "${payload}"; then
    echo "[test] expected hook to allow: ${label}" >&2
    cat "${hook_output}" >&2
    exit 1
  fi
}

expect_blocked() {
  local label="$1"
  local expected_violation="$2"
  local payload="$3"
  if run_hook "${payload}"; then
    echo "[test] expected hook to block: ${label}" >&2
    exit 1
  fi
  if ! grep -qF -- "  - ${expected_violation}" "${hook_output}"; then
    echo "[test] expected violation \"${expected_violation}\" for: ${label}" >&2
    cat "${hook_output}" >&2
    exit 1
  fi
}

push_line() {
  local local_branch="$1"
  local remote_branch="$2"
  printf 'refs/heads/%s %s refs/heads/%s %s\n' \
    "${local_branch}" "${sha}" "${remote_branch}" "${sha}"
}

same_name_push() {
  push_line "$1" "$1"
}

check_cases() {
  expect_allowed "dependabot github_actions branch" \
    "$(same_name_push "dependabot/github_actions/actions/checkout-7.0.1")"
  expect_allowed "dependabot setup-node branch" \
    "$(same_name_push "dependabot/github_actions/actions/setup-node-7.0.0")"
  expect_allowed "dependabot gradle branch with dotted coordinates" \
    "$(same_name_push "dependabot/gradle/back/org.testcontainers-postgresql-1.21.4")"
  expect_allowed "dependabot npm branch under a nested directory" \
    "$(same_name_push "dependabot/npm_and_yarn/front/next-15.5.7")"
  expect_allowed "dependabot grouped update branch" \
    "$(same_name_push "dependabot/github_actions/actions-9f8e7d6c5b")"

  expect_allowed "work branch" "$(same_name_push "fix/foo-bar")"
  expect_allowed "work branch with digits" "$(same_name_push "fix/pre-push-bot-branch-1528")"

  # 1-person project workflow allows pushing directly to main or from a work branch onto main.
  expect_allowed "main direct push" "$(same_name_push "main")"
  expect_allowed "HEAD pushed onto main" \
    "$(printf 'HEAD %s refs/heads/main %s\n' "${sha}" "${sha}")"
  expect_allowed "work branch pushed onto main" "$(push_line "fix/foo-bar" "main")"

  # Deleting a remote work branch is allowed, but deleting main is blocked.
  expect_allowed "branch deletion" \
    "$(printf '(delete) %s refs/heads/fix/foo-bar %s\n' "${zero_sha}" "${sha}")"
  expect_blocked "main deletion" "delete:main" \
    "$(printf '(delete) %s refs/heads/main %s\n' "${zero_sha}" "${sha}")"

  # Everything outside the allowed namespaces stays blocked.
  expect_blocked "agent branch" "local:agent/foo" "$(same_name_push "agent/foo")"
  expect_blocked "unknown type" "local:feature/foo" "$(same_name_push "feature/foo")"
  expect_blocked "uppercase work branch" "local:fix/Foo-Bar" "$(same_name_push "fix/Foo-Bar")"

  # Only refs/heads/* carries a branch name; anything else is reported as a raw ref.
  expect_blocked "tag push" "local-ref:refs/tags/v1" \
    "$(printf 'refs/tags/v1 %s refs/tags/v1 %s\n' "${sha}" "${sha}")"

  expect_blocked "bare dependabot namespace" "local:dependabot" \
    "$(same_name_push "dependabot")"
  expect_blocked "dependabot ecosystem without a dependency segment" \
    "local:dependabot/github_actions" "$(same_name_push "dependabot/github_actions")"
  expect_blocked "dependabot lookalike prefix" "local:dependabot-evil/foo" \
    "$(same_name_push "dependabot-evil/foo")"
  expect_blocked "dependabot segment starting with a hyphen" "local:dependabot/-lead/x" \
    "$(same_name_push "dependabot/-lead/x")"
  expect_blocked "dependabot uppercase ecosystem" "local:dependabot/GITHUB_ACTIONS/x/y" \
    "$(same_name_push "dependabot/GITHUB_ACTIONS/x/y")"

  expect_blocked "blocked local ref pushed onto a bot branch" "local:agent/foo" \
    "$(push_line "agent/foo" "dependabot/github_actions/actions/checkout-7.0.1")"
}

exercised=0
for candidate in C C.UTF-8 en_US.UTF-8 en_US.ISO8859-1 en_US.ISO8859-15; do
  if ! locale_available "${candidate}"; then
    echo "[test] skip: LC_ALL=${candidate} (locale is not installed on this machine)"
    continue
  fi
  hook_locale="${candidate}"
  check_cases
  exercised=$((exercised + 1))
  echo "[test] pre-push branch rules passed under LC_ALL=${candidate}"
done

if [ "${exercised}" -eq 0 ]; then
  echo "[test] no candidate locale is installed, so the branch rules were never exercised" >&2
  exit 1
fi

echo "[test] pre-push branch rules passed"
