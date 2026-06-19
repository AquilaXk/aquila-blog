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
require_pattern 'expected_front_commit_sha:' "workflow must expose an expected_front_commit_sha output"
require_pattern 'git diff-tree --no-commit-id --name-only -r -m "\$\{DEPLOY_SHA\}"' "merge commit changed-file detection must use -m fallback"
reject_pattern 'git diff-tree --no-commit-id --name-only -r "\$\{DEPLOY_SHA\}"' "single-parent diff-tree form can return empty changed files for merge commits"

require_pattern 'needs\.calculateTag\.outputs\.backend_deploy' "backend jobs must be gated by backend_deploy"
require_pattern 'needs\.calculateTag\.outputs\.front_live_verify' "frontend live verification must be gated by front_live_verify"
require_pattern 'needs\.calculateTag\.outputs\.editor_live_canary' "editor seeded live canary must be gated by editor_live_canary"
require_pattern 'needs\.calculateTag\.outputs\.expected_front_commit_sha' "live frontend sha check must use the expected frontend commit output"
reject_pattern 'E2E_EXPECTED_FRONT_COMMIT_SHA:[[:space:]]*\$\{\{ needs\.calculateTag\.outputs\.deploy_sha \}\}' "live frontend sha check must not always expect the deploy sha"
require_pattern 'DEPLOY_SHA_INPUT:[[:space:]]*\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}' "workflow_run deploy target must stay tied to the CI-validated sha"
require_pattern 'REMOTE_MAIN_SHA="\$\(git ls-remote --exit-code origin refs/heads/main \| awk '\''\{print \$1\}'\''\)"' "stale detection must compare against remote main without mutating local history"
require_pattern 'origin/main sha lookup failed' "stale detection must fail closed when remote main lookup fails"
reject_pattern 'git fetch --depth=1 origin main' "stale detection must not make the checkout shallow before changed-file detection"
reject_pattern 'git rev-parse origin/main' "stale detection must not depend on a locally mutated origin/main ref"
require_pattern 'stale workflow_run blocked: deploy_sha=' "stale workflow_run payloads must fail before build and deploy"
reject_pattern 'stale workflow_run payload: deploy_sha=' "stale workflow_run payloads must not continue after log-only detection"
reject_pattern 'STALE_WORKFLOW_RUN' "stale workflow_run payloads must not disable runtime frontend sha verification"
require_pattern 'back_image_ref:[[:space:]]*\$\{\{ steps\.backend_image\.outputs\.back_image_ref \}\}' "build job must expose immutable backend digest ref"
require_pattern 'HOME_BACK_IMAGE:[[:space:]]*\$\{\{ needs\.buildAndPush\.outputs\.back_image_ref \}\}' "deploy job must use immutable backend digest ref"
reject_pattern 'image_latest_ref' "deploy workflow must not calculate or push latest image refs"
reject_pattern 'IMAGE_LATEST_REF="\$\{IMAGE_NAME\}:latest"' "deploy workflow must not create latest image refs"
require_pattern 'HOME_KNOWN_HOSTS:[[:space:]]*\$\{\{ secrets\.HOME_KNOWN_HOSTS \}\}' "pinned known_hosts secret must be required"
require_pattern 'HOME_GHCR_USERNAME:[[:space:]]*\$\{\{ secrets\.HOME_GHCR_USERNAME \}\}' "private GHCR username must be required"
require_pattern 'HOME_GHCR_TOKEN:[[:space:]]*\$\{\{ secrets\.HOME_GHCR_TOKEN \}\}' "private GHCR token must be required"
reject_pattern 'ssh-keyscan' "production deploy must not fall back to runtime host key scanning"
reject_pattern 'HOME_SERVER_ENV_B64=' "HOME_SERVER_ENV must not be passed on the SSH command line"
reject_pattern 'HOME_GHCR_TOKEN_B64=' "HOME_GHCR_TOKEN must not be passed on the SSH command line"
require_pattern 'scp -i "\$SSH_DIR/home_key"' "secret env files must be copied with scp"
require_pattern 'REMOTE_ENV_FILE=' "remote deploy must load secret env from a temporary file"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*\^front/\(src/' "frontend build sha expectation must be tied to runtime frontend file changes"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*packages/' "frontend package workspace changes must force live build sha equality"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*scripts/\(check-refactor-boundaries\\\.mjs' "frontend prebuild script changes must force live build sha equality"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*with-test-lock\\\.mjs' "frontend build wrapper changes must force live build sha equality"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*patch-lodash-template\\\.cjs' "frontend postinstall patch changes must force live build sha equality"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*site\\\.config\\\.js' "frontend site config changes must force live build sha equality"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*tsconfig\\\.json' "frontend TypeScript config changes must force live build sha equality"
require_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN=.*next-sitemap\\\.config\\\.js' "frontend sitemap config changes must force live build sha equality"
reject_pattern "FRONT_BUILD_SHA_PATHS_PATTERN='\\^front/'" "frontend e2e-only changes must not force live build sha equality"
require_pattern 'EXPECTED_FRONT_COMMIT_SHA="\$\{DEPLOY_SHA\}"' "frontend file changes must keep the current deploy sha metadata check"
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
