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
require_pattern 'editor_live_canary:' "workflow must expose an editor_live_canary output"
require_pattern 'git diff-tree --no-commit-id --name-only -r -m "\$\{DEPLOY_SHA\}"' "merge commit changed-file detection must use -m fallback"
reject_pattern 'git diff-tree --no-commit-id --name-only -r "\$\{DEPLOY_SHA\}"' "single-parent diff-tree form can return empty changed files for merge commits"

require_pattern 'needs\.calculateTag\.outputs\.backend_deploy' "backend jobs must be gated by backend_deploy"
require_pattern 'needs\.calculateTag\.outputs\.front_live_verify' "frontend live verification must be gated by front_live_verify"
require_pattern 'needs\.calculateTag\.outputs\.editor_live_canary' "editor seeded live canary must be gated by editor_live_canary"
require_pattern 'EDITOR_LIVE_CANARY_PATHS_PATTERN=.*front/src/components/editor/' "editor canary path classification must include editor component changes"
require_pattern 'EDITOR_LIVE_CANARY_PATHS_PATTERN=.*front/src/pages/editor/' "editor canary path classification must include editor page changes"
require_pattern 'force_editor_live_canary:[[:space:]]*$' "workflow_dispatch must expose force_editor_live_canary input key"
reject_pattern "E2E_LIVE_EDITOR_507_CANARY:[[:space:]]*['\"]?true['\"]?" "editor seeded live canary must not be hardcoded true"
require_pattern 'always\(\)[[:space:]]*&&' "frontLiveE2E must handle skipped backend deploy dependencies explicitly"
require_pattern 'create_external_backup\.sh' "homeserver deploy must create an external storage backup before rollout mutation"
require_pattern 'prune_external_backups\.sh' "homeserver deploy must prune external backups around backup creation"

external_create_line="$(grep -n 'EXTERNAL_BACKUP_DIR=.*create_external_backup\.sh' "${workflow}" | head -n 1 | cut -d: -f1)"
first_prune_line="$(grep -n '^[[:space:]]*\./deploy/homeserver/prune_external_backups\.sh' "${workflow}" | head -n 1 | cut -d: -f1)"
last_prune_line="$(grep -n '^[[:space:]]*\./deploy/homeserver/prune_external_backups\.sh' "${workflow}" | tail -n 1 | cut -d: -f1)"

if [[ -z "${external_create_line}" || -z "${first_prune_line}" || -z "${last_prune_line}" ]]; then
  echo "unexpected: external backup create/prune invocation not found" >&2
  exit 1
fi
if [[ "${first_prune_line}" -ge "${external_create_line}" ]]; then
  echo "unexpected: external backup prune must run before backup creation to free old backups" >&2
  exit 1
fi
if [[ "${last_prune_line}" -le "${external_create_line}" ]]; then
  echo "unexpected: external backup prune must run after backup creation to enforce retention" >&2
  exit 1
fi
