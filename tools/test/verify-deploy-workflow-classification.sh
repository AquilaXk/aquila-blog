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
reject_pattern 'front_live_verify:' "Platform deploy must not expose a frontend live verification output"
reject_pattern 'editor_live_canary:' "Platform deploy must not expose an editor live canary output"
reject_pattern 'expected_front_commit_sha:' "Platform deploy must not expose a frontend commit sha output"
reject_pattern 'frontLiveE2E:' "Platform deploy must not retain the frontend live E2E job"
reject_pattern 'force_front_live_verify:' "Platform manual deploy must not expose a frontend live verification input"
reject_pattern 'force_editor_live_canary:' "Platform manual deploy must not expose an editor live canary input"
require_pattern 'git diff-tree --no-commit-id --name-only -r -m "\$\{DEPLOY_SHA\}"' "merge commit changed-file detection must use -m fallback"
reject_pattern 'git diff-tree --no-commit-id --name-only -r "\$\{DEPLOY_SHA\}"' "single-parent diff-tree form can return empty changed files for merge commits"

require_pattern 'needs\.calculateTag\.outputs\.backend_deploy' "backend jobs must be gated by backend_deploy"
reject_pattern 'needs\.calculateTag\.outputs\.front_live_verify' "Platform deploy must not gate jobs on frontend live verification"
reject_pattern 'needs\.calculateTag\.outputs\.editor_live_canary' "Platform deploy must not gate jobs on an editor live canary"
reject_pattern 'needs\.calculateTag\.outputs\.expected_front_commit_sha' "Platform deploy must not consume a frontend commit sha output"
reject_pattern 'E2E_EXPECTED_FRONT_COMMIT_SHA' "Platform deploy must not parse a frontend live commit sha"
reject_pattern 'statuses:[[:space:]]*read' "Platform deploy must not require frontend Vercel status access"
reject_pattern 'WEB_LIVE_E2E_ENV' "Platform deploy must not parse the Web live E2E environment"
reject_pattern 'validate-env\.mjs --target live-e2e' "Platform deploy must not validate the Web live E2E environment"
reject_pattern 'PLAYWRIGHT_' "Platform deploy must not parse Playwright environment variables"
reject_pattern 'E2E_LIVE_ADMIN_' "Platform deploy must not parse frontend live admin credentials"
reject_pattern 'cache-dependency-path:[[:space:]]*front/yarn\.lock' "Platform deploy must not cache frontend Yarn dependencies"
reject_pattern 'working-directory:[[:space:]]*front' "Platform deploy must not run commands from the frontend directory"
reject_pattern '(^|[^[:alnum:]_])[Yy][Aa][Rr][Nn]([^[:alnum:]_]|$)' "Platform deploy must not use Yarn"
reject_pattern 'playwright' "Platform deploy must not install or run Playwright"
require_pattern 'DEPLOY_SHA_INPUT:[[:space:]]*\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}' "workflow_run deploy target must stay tied to the CI-validated sha"
require_pattern 'REMOTE_MAIN_SHA="\$\(git ls-remote --exit-code origin refs/heads/main \| awk '\''\{print \$1\}'\''\)"' "stale detection must read the current remote main sha"
require_pattern 'origin/main sha lookup failed' "stale detection must fail closed when remote main lookup fails"
require_pattern 'git fetch --no-tags --prune origin "\+refs/heads/main:refs/remotes/origin/main"' "stale detection must fetch current main for path-aware ancestry and diff checks"
require_pattern 'git merge-base --is-ancestor "\$\{DEPLOY_SHA\}" "\$\{REMOTE_MAIN_SHA\}"' "stale detection must reject deploy shas outside current main ancestry"
require_pattern 'deploy sha is not reachable from origin/main' "stale detection must fail closed when deploy sha is not on current main"
require_pattern 'STALE_CHANGED_FILES="\$\(git diff --name-only "\$\{DEPLOY_SHA\}" "\$\{REMOTE_MAIN_SHA\}"' "stale detection must diff deploy sha through current main"
require_pattern 'BACKEND_DEPLOY_PATHS_PATTERN=.*deploy/env/' "backend deploy trigger must include deploy env contract changes"
require_pattern 'BACKEND_DEPLOY_PATHS_PATTERN=.*tools/env/' "backend deploy trigger must include deploy env validator changes"
require_pattern 'STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*deploy/env/' "stale detection must block newer deploy env contract changes"
require_pattern 'STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*tools/env/' "stale detection must block newer deploy env validator changes"
require_pattern 'grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}"' "stale detection must use the deploy safety path pattern"
require_pattern 'stale workflow_run allowed after backend-neutral newer main changes: deploy_sha=' "backend-neutral newer main changes must not block a pending backend deploy"
require_pattern 'stale workflow_run blocked by backend-impacting newer main changes: deploy_sha=' "backend-impacting newer main changes must block stale deploys"
reject_pattern 'git fetch --depth=1 origin main' "stale detection must not make the checkout shallow before changed-file detection"
reject_pattern 'git rev-parse origin/main' "stale detection must not depend on a locally mutated origin/main ref"
reject_pattern 'stale workflow_run payload: deploy_sha=' "stale workflow_run payloads must not continue after log-only detection"
reject_pattern 'STALE_WORKFLOW_RUN' "stale workflow_run payloads must not bypass deploy safety checks"
require_pattern 'back_image_ref:[[:space:]]*\$\{\{ steps\.backend_image\.outputs\.back_image_ref \}\}' "build job must expose immutable backend digest ref"
require_pattern 'HOME_BACK_IMAGE:[[:space:]]*\$\{\{ needs\.buildAndPush\.outputs\.back_image_ref \}\}' "deploy job must use immutable backend digest ref"
reject_pattern 'image_latest_ref' "deploy workflow must not calculate or push latest image refs"
reject_pattern 'IMAGE_LATEST_REF="\$\{IMAGE_NAME\}:latest"' "deploy workflow must not create latest image refs"

# front 배포 계약 (#1539). 위의 reject 목록이 막는 것은 "Platform deploy가 프론트를 빌드·검증하는
# 것"이고, 여기서 요구하는 것은 "Platform deploy가 이미 push된 front digest를 홈서버에 올리는 것"
# 이다. 두 목록은 서로를 무효화하지 않는다.
require_pattern 'front_deploy:[[:space:]]*\$\{\{ steps\.meta\.outputs\.front_deploy \}\}' "workflow must expose a front_deploy output"
require_pattern 'needs\.calculateTag\.outputs\.front_deploy == .true.' "front deploy job must be gated by front_deploy"
require_pattern 'FRONT_DEPLOY_PATHS_PATTERN=.*front/' "front deploy trigger must classify front source paths"
require_pattern 'FRONT_DEPLOY_PATHS_PATTERN=.*frontend-image' "front deploy trigger must follow the workflow that builds the front image"
reject_pattern 'FRONT_DEPLOY_PATHS_PATTERN=.*(back/|deploy/homeserver/|deploy/env/|tools/env/)' "front deploy must trigger independently of backend deploy paths"
reject_pattern 'BACKEND_DEPLOY_PATHS_PATTERN=.*front/' "backend deploy must not be triggered by front-only changes"
require_pattern 'needs\.blueGreenDeploy\.result == .success.' "front deploy must be serialized after the backend deploy on the same host"
require_pattern 'needs\.calculateTag\.outputs\.backend_deploy != .true. \|\|' "front deploy must still run on commits where the backend was never scheduled"
# GitHub 은 의존 job 이 실패해 **실행되지 않은** job 의 result 도 skipped 로 보고한다. skipped 를
# 전제 충족으로 읽으면 backend 빌드가 깨진 커밋에서 front 가 구 backend 위로 cutover 된다.
# 정상 skip 과 사고 skip 을 가르는 신호는 result 가 아니라 calculateTag 의 backend_deploy 판정이다.
reject_pattern 'needs\.blueGreenDeploy\.result == .skipped.' "a skipped backend deploy must not admit the front deploy: an upstream build failure produces the same result value"
reject_pattern 'always\(\) &&' "front deploy must not run on cancelled workflows"
require_pattern 'HOME_FRONT_IMAGE:[[:space:]]*\$\{\{ steps\.front_image\.outputs\.front_image_ref \}\}' "front deploy job must use the resolved front digest ref"
require_pattern 'front_image_ref=\$\{FRONT_IMAGE_NAME\}@\$\{FRONT_IMAGE_DIGEST\}' "front image ref must be resolved to an immutable digest ref"
reject_pattern 'front_image_ref=\$\{FRONT_IMAGE_NAME\}:' "front image ref must not stay on a mutable tag ref"
require_pattern 'front image must be pinned by sha256 digest' "remote front deploy must reject a front image that is not digest pinned"
require_pattern 'DEPLOY_TARGET=front' "front rollout must run through the shared blue/green script"
require_pattern 'STAGED_FRONT_BUILD_SHA=' "front deploy must pass the build sha that the cutover verification compares the served build against"
require_pattern 'front deploy finished without reporting a result marker' "front deploy must fail when the remote rollout reports no result"
require_pattern 'HOME_KNOWN_HOSTS:[[:space:]]*\$\{\{ secrets\.HOME_KNOWN_HOSTS \}\}' "pinned known_hosts secret must be required"
require_pattern 'HOME_GHCR_USERNAME:[[:space:]]*\$\{\{ secrets\.HOME_GHCR_USERNAME \}\}' "private GHCR username must be required"
require_pattern 'HOME_GHCR_TOKEN:[[:space:]]*\$\{\{ secrets\.HOME_GHCR_TOKEN \}\}' "private GHCR token must be required"
reject_pattern 'ssh-keyscan' "production deploy must not fall back to runtime host key scanning"
reject_pattern 'HOME_SERVER_ENV_B64=' "HOME_SERVER_ENV must not be passed on the SSH command line"
reject_pattern 'HOME_GHCR_TOKEN_B64=' "HOME_GHCR_TOKEN must not be passed on the SSH command line"
require_pattern 'scp -i "\$SSH_DIR/home_key"' "secret env files must be copied with scp"
require_pattern 'REMOTE_ENV_FILE=' "remote deploy must load secret env from a temporary file"
require_pattern 'cleanup_remote_tmp_from_runner\(\)' "runner must clean remote temp secret files when transfer or remote launch fails"
require_pattern 'trap cleanup_remote_tmp_from_runner EXIT' "runner cleanup trap must be active before scp transfers secret files"
require_pattern 'REMOTE_TMP_DIR=""' "runner cleanup trap must be disabled only after remote cleanup completes"
reject_pattern 'FRONT_BUILD_SHA_PATHS_PATTERN' "Platform deploy must not classify frontend build sha paths"
reject_pattern 'FRONT_LIVE_VERIFY_PATHS_PATTERN' "Platform deploy must not classify frontend live verification paths"
reject_pattern 'EDITOR_LIVE_CANARY_PATHS_PATTERN' "Platform deploy must not classify editor live canary paths"
reject_pattern 'EXPECTED_FRONT_COMMIT_SHA' "Platform deploy must not calculate frontend commit metadata"
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
