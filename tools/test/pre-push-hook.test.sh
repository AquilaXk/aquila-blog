#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

# .githooks/pre-push is tracked, so a missing file means the checkout is incomplete rather
# than a developer-local setup step being skipped.
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

# bash resolves regex ranges such as [a-z0-9] through locale collation, so the branch rules
# only mean the same thing everywhere while the hook pins the locale. Most CI runners ship
# only C and C.UTF-8, and neither reproduces the single-byte collation that makes uppercase
# names slip through, so assert the pin itself as well as running the cases per locale.
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

# Git feeds pre-push one "<local ref> <local sha> <remote ref> <remote sha>" line per ref.
# Drop the ambient locale first: an exported LC_ALL would otherwise override the case's own.
run_hook() {
  local payload="$1"
  set +e
  # Git terminates every ref line with a newline; a payload without one would make the
  # hook's read loop drop the last ref and pass by accident.
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
  # Bot branches: Dependabot pushes through the GitHub API and never runs this hook, but a
  # human who adds a correction commit to that PR does, so the namespace has to be pushable.
  expect_allowed "dependabot github_actions branch" \
    "$(same_name_push "dependabot/github_actions/actions/checkout-7.0.1")"
  expect_allowed "dependabot setup-node branch" \
    "$(same_name_push "dependabot/github_actions/actions/setup-node-7.0.0")"
  # Gradle coordinates keep the dots of the group id, which the work branch rule forbids.
  expect_allowed "dependabot gradle branch with dotted coordinates" \
    "$(same_name_push "dependabot/gradle/back/org.testcontainers-postgresql-1.21.4")"
  expect_allowed "dependabot npm branch under a nested directory" \
    "$(same_name_push "dependabot/npm_and_yarn/front/next-15.5.7")"
  expect_allowed "dependabot grouped update branch" \
    "$(same_name_push "dependabot/github_actions/actions-9f8e7d6c5b")"

  # Human work branches keep the existing type/short-description rule.
  expect_allowed "work branch" "$(same_name_push "fix/foo-bar")"
  expect_allowed "work branch with digits" "$(same_name_push "fix/pre-push-bot-branch-1528")"

  # Deleting a remote branch sends a zero local sha and no local ref name.
  expect_allowed "branch deletion" \
    "$(printf '(delete) %s refs/heads/fix/foo-bar %s\n' "${zero_sha}" "${sha}")"

  # Protected branches stay blocked.
  expect_blocked "main" "local:main" "$(same_name_push "main")"

  # Everything outside the allowed namespaces stays blocked.
  expect_blocked "agent branch" "local:agent/foo" "$(same_name_push "agent/foo")"
  expect_blocked "unknown type" "local:feature/foo" "$(same_name_push "feature/foo")"
  expect_blocked "uppercase work branch" "local:fix/Foo-Bar" "$(same_name_push "fix/Foo-Bar")"

  # Only refs/heads/* carries a branch name; anything else is reported as a raw ref.
  expect_blocked "tag push" "local-ref:refs/tags/v1" \
    "$(printf 'refs/tags/v1 %s refs/tags/v1 %s\n' "${sha}" "${sha}")"

  # The bot namespace must not degenerate into "anything under a prefix".
  expect_blocked "bare dependabot namespace" "local:dependabot" \
    "$(same_name_push "dependabot")"
  expect_blocked "dependabot ecosystem without a dependency segment" \
    "local:dependabot/github_actions" "$(same_name_push "dependabot/github_actions")"
  expect_blocked "dependabot lookalike prefix" "local:dependabot-evil/foo" \
    "$(same_name_push "dependabot-evil/foo")"
  expect_blocked "dependabot segment starting with a hyphen" "local:dependabot/-lead/x" \
    "$(same_name_push "dependabot/-lead/x")"
  # Dependabot ecosystems are lowercase; an uppercase one is the case a locale-dependent
  # character range would wrongly let through.
  expect_blocked "dependabot uppercase ecosystem" "local:dependabot/GITHUB_ACTIONS/x/y" \
    "$(same_name_push "dependabot/GITHUB_ACTIONS/x/y")"

  # The hook validates the local ref name and the remote ref name independently.
  expect_blocked "allowed local ref pushed onto main" "remote:main" \
    "$(push_line "fix/foo-bar" "main")"
  expect_blocked "blocked local ref pushed onto a bot branch" "local:agent/foo" \
    "$(push_line "agent/foo" "dependabot/github_actions/actions/checkout-7.0.1")"
}

# Single-byte locales are the ones that broke the ranges, so they are the cases that matter.
# Skip loudly rather than silently when a machine does not have one installed.
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
