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

require_fixed() {
  local text="$1"
  local message="$2"

  if ! grep -Fq -- "${text}" "${workflow}"; then
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

require_pattern 'queue:[[:space:]]*max' "homeserver deploy concurrency must retain queued deploys"
reject_pattern 'cancel-in-progress:[[:space:]]*true' "homeserver deploy must not cancel an in-progress stateful deploy"
reject_pattern 'cancel-in-progress:[[:space:]]*false' "native queue mode must not be combined with legacy concurrency cancellation"

require_pattern 'backend_deploy:' "workflow must expose a backend_deploy output"
reject_pattern 'front_live_verify:' "Platform deploy must not expose a frontend live verification output"
reject_pattern 'editor_live_canary:' "Platform deploy must not expose an editor live canary output"
reject_pattern 'expected_front_commit_sha:' "Platform deploy must not expose a frontend commit sha output"
legacy_front_live_job='frontLive''E2E:'
reject_pattern "${legacy_front_live_job}" "Platform deploy must not retain the frontend live E2E job"
reject_pattern 'force_front_live_verify:' "Platform manual deploy must not expose a frontend live verification input"
reject_pattern 'force_editor_live_canary:' "Platform manual deploy must not expose an editor live canary input"
require_pattern 'git diff-tree --no-commit-id --name-only -r -m "\$\{DEPLOY_SHA\}"' "merge commit changed-file detection must use -m fallback"
reject_pattern 'git diff-tree --no-commit-id --name-only -r "\$\{DEPLOY_SHA\}"' "single-parent diff-tree form can return empty changed files for merge commits"

require_pattern 'needs\.calculateTag\.outputs\.backend_deploy' "backend jobs must be gated by backend_deploy"
reject_pattern 'needs\.calculateTag\.outputs\.front_live_verify' "Platform deploy must not gate jobs on frontend live verification"
reject_pattern 'needs\.calculateTag\.outputs\.editor_live_canary' "Platform deploy must not gate jobs on an editor live canary"
reject_pattern 'needs\.calculateTag\.outputs\.expected_front_commit_sha' "Platform deploy must not consume a frontend commit sha output"
reject_pattern 'E2E_EXPECTED_FRONT_COMMIT_SHA' "Platform deploy must not parse a frontend live commit sha"
reject_pattern 'statuses:[[:space:]]*read' "Platform deploy must not require frontend deployment status access"
reject_pattern 'WEB_LIVE_E2E_ENV' "Platform deploy must not parse the Web live E2E environment"
reject_pattern 'validate-env\.mjs --target live-e2e' "Platform deploy must not validate the Web live E2E environment"
reject_pattern 'PLAYWRIGHT_' "Platform deploy must not parse Playwright environment variables"
reject_pattern 'E2E_LIVE_ADMIN_' "Platform deploy must not parse frontend live admin credentials"
reject_pattern 'cache-dependency-path:[[:space:]]*front/yarn\.lock' "Platform deploy must not cache frontend Yarn dependencies"
reject_pattern 'working-directory:[[:space:]]*front' "Platform deploy must not run commands from the frontend directory"
docker_publish_command_matches() {
  local source="$1"

  awk '
    function find_command(fields, count, start, commands, i, token) {
      command_index = 0
      for (i = start; i <= count; i++) {
        token = fields[i]
        if (token ~ /^-/) {
          if (i < count && fields[i + 1] !~ /^-/ && fields[i + 1] !~ commands) i++
          continue
        }
        command_index = i
        return token
      }
      return ""
    }
    function inspect(line, count, fields, position, command, subcommand, quote) {
      sub(/^[[:space:]]*/, "", line)
      sub(/^(if|then)[[:space:]]+/, "", line)
      sub(/^-[[:space:]]+run:[[:space:]]+/, "", line)
      sub(/^run:[[:space:]]+/, "", line)
      sub(/^[[:space:]]*/, "", line)
      quote = sprintf("%c", 39)
      if (substr(line, 1, 1) == "\"" || substr(line, 1, 1) == quote) line = substr(line, 2)
      if (substr(line, length(line), 1) == "\"" || substr(line, length(line), 1) == quote) line = substr(line, 1, length(line) - 1)
      count = split(line, fields, /[[:space:]]+/)
      position = 1
      while (fields[position] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) position++
      if (fields[position] == "sudo") position++
      if (fields[position] != "docker") return
      command = find_command(fields, count, position + 1, "^(image|buildx|builder|compose|manifest|build|bake|push)$")
      if (command ~ /^(build|bake|push)$/) {
        found = 1
        return
      }
      if (command == "image") {
        subcommand = find_command(fields, count, command_index + 1, "^(build|push)$")
        if (subcommand ~ /^(build|push)$/) found = 1
        return
      }
      if (command == "manifest") {
        if (find_command(fields, count, command_index + 1, "^push$") == "push") found = 1
        return
      }
      if (command == "buildx") {
        subcommand = find_command(fields, count, command_index + 1, "^(build|bake|imagetools)$")
        if (subcommand ~ /^(build|bake)$/) {
          found = 1
          return
        }
        if (subcommand == "imagetools" && find_command(fields, count, command_index + 1, "^create$") == "create") found = 1
        return
      }
      if (command == "builder") {
        if (find_command(fields, count, command_index + 1, "^build$") == "build") found = 1
        return
      }
      if (command == "compose") {
        subcommand = find_command(fields, count, command_index + 1, "^(build|push|up)$")
        if (subcommand ~ /^(build|push)$/) {
          found = 1
          return
        }
        if (subcommand == "up") {
          for (i = command_index + 1; i <= count; i++) {
            if (fields[i] == "--build") {
              found = 1
              return
            }
          }
        }
      }
    }
    {
      sub(/\r$/, "")
      line = continued ? buffered " " $0 : $0
      if (line ~ /\\[[:space:]]*$/) {
        sub(/\\[[:space:]]*$/, "", line)
        buffered = line
        continued = 1
        next
      }
      segment_count = split(line, segments, /&&|\|\||[;|]/)
      for (segment = 1; segment <= segment_count; segment++) inspect(segments[segment])
      buffered = ""
      continued = 0
    }
    END {
      if (continued) inspect(buffered)
      exit found ? 0 : 1
    }
  ' <<< "${source}"
}

for docker_publish_fixture in \
  'docker --debug manifest --insecure push ghcr.io/x' \
  'docker buildx --builder deploy imagetools --debug create ghcr.io/x' \
  'docker --context x buildx --builder y bake --push' \
  'docker --context x build' \
  'docker buildx --builder y build' \
  'docker image build ghcr.io/x' \
  'docker compose build' \
  'docker compose push' \
  'docker compose up --build' \
  'docker --context x compose -f file build' \
  'docker compose -f file up --build' \
  'docker --context x compose -f file up -d --build' \
  'docker builder build' \
  'docker builder --context x build' \
  'DOCKER_BUILDKIT=1 docker build .' \
  'sudo docker push ghcr.io/x' \
  '- run: docker build .' \
  'run: "docker build ."' \
  "run: 'docker build .'" \
  'cd x && docker build .' \
  'true; docker push ghcr.io/x' \
  'printf context | docker build -' \
  'if docker build .; then true; fi' \
  $'docker --context unix:///var/run/docker.sock \\\n  manifest --insecure \\\n  push ghcr.io/x' \
  $'docker buildx --builder deploy \\\r\n  imagetools --debug \\\r\n  create ghcr.io/x'; do
  if ! docker_publish_command_matches "${docker_publish_fixture}"; then
    echo "missing: Platform Docker publish classifier must reject ${docker_publish_fixture//$'\n'/ }" >&2
    exit 1
  fi
done

for docker_publish_non_fixture in \
  'echo "docker manifest push is forbidden"' \
  '# docker manifest push is forbidden' \
  'docker image inspect push' \
  'docker run --rm alpine echo build' \
  'docker pull x # manifest push'; do
  if docker_publish_command_matches "${docker_publish_non_fixture}"; then
    echo "unexpected: Platform Docker publish classifier rejected non-command text" >&2
    exit 1
  fi
done

if docker_publish_command_matches "$(< "${workflow}")"; then
  echo "unexpected: Platform must not shell-build or publish a Web image" >&2
  exit 1
fi
reject_pattern 'repository:[[:space:]]*.*aquila-blog-web' "Platform must not check out the Web repository"
reject_pattern 'Dockerfile\.runtime' "Platform must not reference the Web runtime Dockerfile"
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
require_pattern 'stale deploy blocked by backend-impacting newer main changes: deploy_sha=' "backend-impacting newer main changes must block stale deploys"
reject_pattern 'git fetch --depth=1 origin main' "stale detection must not make the checkout shallow before changed-file detection"
reject_pattern 'git rev-parse origin/main' "stale detection must not depend on a locally mutated origin/main ref"
reject_pattern 'stale workflow_run payload: deploy_sha=' "stale workflow_run payloads must not continue after log-only detection"
reject_pattern 'STALE_WORKFLOW_RUN' "stale workflow_run payloads must not bypass deploy safety checks"
require_pattern 'back_image_ref:[[:space:]]*\$\{\{ steps\.backend_image\.outputs\.back_image_ref \}\}' "build job must expose immutable backend digest ref"
require_pattern 'HOME_BACK_IMAGE:[[:space:]]*\$\{\{ needs\.buildAndPush\.outputs\.back_image_ref \}\}' "deploy job must use immutable backend digest ref"
require_pattern 'Require successful Security for deploy SHA' "dispatches must pass the existing Security success gate"
reject_pattern "if: github\.event_name != 'repository_dispatch'" "Security success gate must not skip repository_dispatch"
reject_pattern 'image_latest_ref' "deploy workflow must not calculate or push latest image refs"
reject_pattern 'IMAGE_LATEST_REF="\$\{IMAGE_NAME\}:latest"' "deploy workflow must not create latest image refs"

# Web producer가 검증한 immutable digest만 dispatch로 전달한다. Platform은 tag 조회·대기·재조립을
# 하지 않고 payload를 fail-closed로 검증한 뒤 그대로 원격 rollout에 넘긴다.
require_pattern 'front_deploy:[[:space:]]*\$\{\{ steps\.meta\.outputs\.front_deploy \}\}' "workflow must expose a front_deploy output"
require_pattern 'needs\.calculateTag\.outputs\.front_deploy == .true.' "front deploy job must be gated by front_deploy"
require_pattern 'repository_dispatch:' "Platform must receive the Web image dispatch"
require_pattern 'web_frontend_image_ready' "Platform must accept only the Web image event"
require_fixed "WEB_FRONTEND_DISPATCH_SENDER: \${{ github.event.sender.login || '' }}" "dispatch sender must be passed to executable validation"
require_pattern 'WEB_FRONTEND_DISPATCH_SENDER.*REPO_SYNC_APP_BOT_LOGIN' "dispatch sender must be compared to the configured App bot"
require_pattern 'WEB_FRONTEND_SOURCE_REPOSITORY.*github\.event\.client_payload\.source_repository' "source repository must come from the dispatch payload"
require_pattern 'WEB_FRONTEND_SOURCE_SHA.*github\.event\.client_payload\.source_sha' "source sha must come from the dispatch payload"
require_pattern 'WEB_FRONTEND_IMAGE_REF.*github\.event\.client_payload\.image_ref' "image ref must come from the dispatch payload"
require_pattern 'WEB_FRONTEND_SOURCE_REPOSITORY.*AquilaXk/aquila-blog-web' "only the Web repository may trigger a front deploy"
require_pattern "repository dispatch source sha is invalid" "source sha must fail closed"
require_pattern "repository dispatch image ref is not the immutable Web digest" "front image ref must fail closed"
require_pattern 'front_image_ref=\$\{FRONT_IMAGE_REF\}' "payload digest must be the sole front image output"
require_pattern 'front_source_sha=\$\{FRONT_SOURCE_SHA\}' "payload source sha must be the sole front build sha output"
reject_pattern 'FRONT_DEPLOY_PATHS_PATTERN' "Platform must not classify front paths"
reject_pattern 'git rev-list -1 --first-parent' "Platform must not infer a front source commit"
reject_pattern 'FRONT_IMAGE_WAIT_ATTEMPTS' "Platform must not poll for an image tag"
reject_pattern 'manifest_digest\(' "Platform must not resolve a mutable tag to a digest"
reject_pattern 'registry_pull_token\(' "Platform must not query GHCR for a replacement digest"
reject_pattern 'force_front_deploy' "manual front fallback is forbidden"
reject_pattern 'BACKEND_DEPLOY_PATHS_PATTERN=.*front/' "backend deploy must not be triggered by front-only changes"
require_pattern 'needs\.blueGreenDeploy\.result == .success.' "front deploy must be serialized after the backend deploy on the same host"
require_pattern 'needs\.calculateTag\.outputs\.backend_deploy != .true. \|\|' "front deploy must still run on commits where the backend was never scheduled"
# GitHub 은 의존 job 이 실패해 **실행되지 않은** job 의 result 도 skipped 로 보고한다. skipped 를
# 전제 충족으로 읽으면 backend 빌드가 깨진 커밋에서 front 가 구 backend 위로 cutover 된다.
# 정상 skip 과 사고 skip 을 가르는 신호는 result 가 아니라 calculateTag 의 backend_deploy 판정이다.
reject_pattern 'needs\.blueGreenDeploy\.result == .skipped.' "a skipped backend deploy must not admit the front deploy: an upstream build failure produces the same result value"
reject_pattern 'always\(\) &&' "front deploy must not run on cancelled workflows"
require_pattern 'HOME_FRONT_IMAGE:[[:space:]]*\$\{\{ needs\.calculateTag\.outputs\.front_image_ref \}\}' "front deploy job must use the dispatched digest ref"
require_pattern 'front image must be pinned by sha256 digest' "remote front deploy must reject a front image that is not digest pinned"
require_pattern 'DEPLOY_TARGET=front' "front rollout must run through the shared blue/green script"
require_pattern 'STAGED_FRONT_BUILD_SHA=' "front deploy must pass the build sha that the cutover verification compares the served build against"
require_pattern 'front deploy finished without reporting a result marker' "front deploy must fail when the remote rollout reports no result"
# 결과 요약은 ssh 성공 후에만 실행된다. 시도한 이미지·커밋은 그 앞에서 적어야 실패한 run에도
# "무엇을 배포하려 했는지"가 남는다.
require_pattern 'echo "- deploy sha: \$\{HOME_DEPLOY_SHA\}"' "front deploy must record the attempted image and sha before the remote rollout runs"
require_pattern 'front deploy reported success but the edge served build sha' "runner must re-check the served build sha the remote reported"
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
# 구 API 호스트 접기 (#1596). 배포 후 공개 검증은 실제로 서비스되는 호스트를 때려야 한다.
# 구 호스트를 남겨 두면 Tunnel public hostname을 지우는 순간 다음 배포가 이 게이트에서 깨지고,
# 검증만 먼저 지우면 아무도 안 보는 사이 배포가 green으로 통과한다.
reject_pattern 'API_DOMAIN' "Platform deploy must not read or probe the retired host-based API domain"
require_pattern 'rollback_and_exit "missing_web_domain"' "post-deploy verification must fail closed when WEB_DOMAIN is absent"
require_pattern 'wait_public_api_health "\$\{WEB_DOMAIN\}"' "public API health must be probed on the public web host"
require_pattern 'https://\$\{WEB_DOMAIN\}/post/api/v1/posts/feed' "public read canary must run on the public web host"
require_pattern 'https://\$\{WEB_DOMAIN\}/member/api/v1/auth/me' "protected-path security header smoke must run on the public web host"
# 내부 edge 스모크(#1591)는 DNS 전 라우팅 게이트고 공개 HTTPS 스모크는 실서비스 게이트다.
# 전환이 끝난 뒤에도 내부 게이트가 조건부로 남으면 WEB_DOMAIN이 빠진 배포가 검증 없이 통과한다.
reject_pattern 'skipping the same-origin public API route gate' "the internal edge route gate must not be skippable after the cutover"
# 매치되는 vhost가 없는 Host에 Caddy는 404가 아니라 `200` + 빈 본문을 준다(실측). 상태 코드만
# 보면 WEB_DOMAIN과 Caddyfile이 어긋난 순간 이 게이트가 조용히 통과한다.
require_pattern 'rollback_and_exit "web_host_api_route_empty_body"' "the internal edge route gate must reject an empty body that an unmatched Host also returns"

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

echo "[test] Platform deploy workflow classification: PASS"
