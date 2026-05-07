#!/usr/bin/env bash
set -euo pipefail

workflow=".github/workflows/deploy.yml"

if [[ ! -f "${workflow}" ]]; then
  echo "missing workflow: ${workflow}" >&2
  exit 1
fi

require_pattern() {
  local pattern="$1"
  local message="$2"

  if ! grep -Eq "${pattern}" "${workflow}"; then
    echo "missing: ${message}" >&2
    exit 1
  fi
}

reject_pattern() {
  local pattern="$1"
  local message="$2"

  if grep -Eq "${pattern}" "${workflow}"; then
    echo "unexpected: ${message}" >&2
    exit 1
  fi
}

require_pattern 'cancel-in-progress:[[:space:]]*false' "homeserver deploy concurrency must serialize instead of cancelling in-progress deploys"
reject_pattern 'cancel-in-progress:[[:space:]]*true' "homeserver deploy must not cancel an in-progress stateful deploy"

require_pattern 'backend_deploy:' "workflow must expose a backend_deploy output"
require_pattern 'front_live_verify:' "workflow must expose a front_live_verify output"
require_pattern 'git diff-tree --no-commit-id --name-only -r -m "\$\{DEPLOY_SHA\}"' "merge commit changed-file detection must use -m fallback"
reject_pattern 'git diff-tree --no-commit-id --name-only -r "\$\{DEPLOY_SHA\}"' "single-parent diff-tree form can return empty changed files for merge commits"

require_pattern 'needs\.calculateTag\.outputs\.backend_deploy' "backend jobs must be gated by backend_deploy"
require_pattern 'needs\.calculateTag\.outputs\.front_live_verify' "frontend live verification must be gated by front_live_verify"
require_pattern 'always\(\)[[:space:]]*&&' "frontLiveE2E must handle skipped backend deploy dependencies explicitly"
