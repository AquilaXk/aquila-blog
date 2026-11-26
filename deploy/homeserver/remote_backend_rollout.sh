#!/usr/bin/env bash
set -euo pipefail

[ -n "${REMOTE_TMP_DIR:-}" ] || { echo "REMOTE_TMP_DIR is required" >&2; exit 1; }
# shellcheck source=/dev/null
source "${REMOTE_TMP_DIR}/rollout_common.sh"
# shellcheck source=/dev/null
source "${REMOTE_TMP_DIR}/post_deploy_verify.sh"

HOME_APP_DIR="$(decode_b64 "${HOME_APP_DIR_B64:-}")"
[ -n "${HOME_APP_DIR:-}" ] || { echo "HOME_APP_DIR is empty. abort deploy." >&2; exit 1; }
REMOTE_ENV_FILE="${REMOTE_TMP_DIR}/home-server.env"
REMOTE_VARS_FILE="${REMOTE_TMP_DIR}/home-remote-vars.env"

DEPLOY_COMPLETED="false"
ROLLBACK_IN_PROGRESS="false"
ROLLBACK_RUNTIME_SPLIT_ENABLED="false"
RUNTIME_ENV_MATERIALIZED="false"
PRE_DEPLOY_ENV_CAPTURED="false"
PRE_DEPLOY_ENV_CONTENT=""
BACKUP_DIR=""

rollback_from_backup_if_needed() {
  return 0
}

on_exit() {
  local status="$?"
  cleanup_remote_tmp
  if [ "${status}" -ne 0 ]; then
    rollback_from_backup_if_needed "unexpected_exit_status_${status}"
  fi
}

trap on_exit EXIT

HOME_SERVER_ENV="$(cat "${REMOTE_ENV_FILE}")"
# shellcheck disable=SC1090
. "${REMOTE_VARS_FILE}"
export HOME_SERVER_ENV

restart_external_backup_legacy_minio_if_needed() {
  local marker="deploy/homeserver/.external-minio-migration-stopped"
  local migrated_minio_dir=""
  local cid
  local line
  if [ ! -f "${marker}" ]; then
    return 0
  fi
  while IFS= read -r line; do
    [ -n "${line}" ] || continue
    case "${line}" in
      minio_dir=*)
        migrated_minio_dir="${line#minio_dir=}"
        continue
        ;;
      cid=*)
        cid="${line#cid=}"
        ;;
      *)
        cid="${line}"
        ;;
    esac
    echo "restarting legacy minio container before rollback: ${cid}" >&2
    docker start "${cid}" >/dev/null 2>&1 || true
  done < "${marker}"
  case "${migrated_minio_dir}" in
    "")
      ;;
    /mnt/aquila-blog-data/minio)
      echo "keeping migrated MinIO copy for manual reconciliation after rollback: ${migrated_minio_dir}" >&2
      ;;
    *)
      echo "keeping unexpected migrated MinIO path from marker: ${migrated_minio_dir}" >&2
      ;;
  esac
  rm -f "${marker}"
}

cd "${HOME_APP_DIR}"

if [ -z "${HOME_DEPLOY_SHA:-}" ]; then
  echo "HOME_DEPLOY_SHA is empty. abort deploy." >&2
  exit 1
fi

git fetch origin main --prune
if ! git cat-file -e "${HOME_DEPLOY_SHA}^{commit}" 2>/dev/null; then
  git fetch origin "${HOME_DEPLOY_SHA}" --depth 1 || true
fi
if ! git cat-file -e "${HOME_DEPLOY_SHA}^{commit}" 2>/dev/null || ! git merge-base --is-ancestor "${HOME_DEPLOY_SHA}" "origin/main"; then
  echo "deploy sha is unavailable or unreachable from origin/main" >&2
  exit 1
fi
if ! preflight_profile_workspace_cutover_source_floor back; then
  exit 1
fi

umask 077
if [ ! -f deploy/homeserver/create_deploy_backup.sh ]; then
  echo "deploy backup script missing before checkout: deploy/homeserver/create_deploy_backup.sh" >&2
  exit 1
fi
chmod +x deploy/homeserver/create_deploy_backup.sh
BACKUP_DIR="$(./deploy/homeserver/create_deploy_backup.sh)"
echo "backup created (pre-checkout): ${BACKUP_DIR}"
BACKUP_FLYWAY_SCHEMA_VERSION="$(
  awk -F= '$1 == "flyway_schema_version" { value = substr($0, index($0, "=") + 1); gsub(/\r/, "", value); print value }' \
    "${BACKUP_DIR}/metadata.env" 2>/dev/null | tail -n 1
)"
if [ -z "${BACKUP_FLYWAY_SCHEMA_VERSION}" ]; then
  BACKUP_FLYWAY_SCHEMA_VERSION="unavailable"
fi
echo "backup Flyway schema identity: ${BACKUP_FLYWAY_SCHEMA_VERSION}"
if grep -qx 'restore_source=worktree' "${BACKUP_DIR}/metadata.env" 2>/dev/null; then
  echo "::warning title=Rollback restore point fell back to the working tree::no successful-deploy baseline was found at deploy/homeserver/.deploy-baseline; a rollback would restore the server working tree instead of the last verified deploy"
fi

git fetch origin main --prune
if ! git cat-file -e "${HOME_DEPLOY_SHA}^{commit}" 2>/dev/null; then
  git fetch origin "${HOME_DEPLOY_SHA}" --depth 1 || true
fi
if ! git cat-file -e "${HOME_DEPLOY_SHA}^{commit}" 2>/dev/null; then
  echo "deploy sha not found in remote repository: ${HOME_DEPLOY_SHA}" >&2
  exit 1
fi
if ! git merge-base --is-ancestor "${HOME_DEPLOY_SHA}" "origin/main"; then
  echo "deploy sha is not reachable from origin/main: ${HOME_DEPLOY_SHA}" >&2
  exit 1
fi

git checkout --force "${HOME_DEPLOY_SHA}"

mkdir -p deploy/homeserver

chmod +x \
  restore-privacy-gate.sh \
  deploy/homeserver/create_deploy_backup.sh \
  deploy/homeserver/create_external_backup.sh \
  deploy/homeserver/prune_external_backups.sh \
  deploy/homeserver/blue_green_deploy.sh \
  deploy/homeserver/minio_service_identity.sh \
  deploy/homeserver/pgroonga_precheck.sh \
  deploy/homeserver/post_precheck_env_guard.sh \
  deploy/homeserver/rollback_last_deploy.sh \
  deploy/homeserver/record_deploy_baseline.sh \
  deploy/homeserver/steady_state_guard.sh \
  deploy/homeserver/install_steady_state_guard_cron.sh \
  deploy/homeserver/install_external_backup_timer.sh

restore_backup_files_minimally() {
  local backup_dir="$1"
  if [ -z "${backup_dir:-}" ] || [ ! -d "${backup_dir}" ]; then
    return 1
  fi

  for file in docker-compose.prod.yml .active_backend; do
    if [ -f "${backup_dir}/${file}" ]; then
      cp "${backup_dir}/${file}" "deploy/homeserver/${file}"
    fi
  done

  if [ -d "${backup_dir}/caddy" ]; then
    rm -rf deploy/homeserver/caddy
    cp -R "${backup_dir}/caddy" deploy/homeserver/caddy
  elif [ -f "${backup_dir}/Caddyfile" ]; then
    mkdir -p deploy/homeserver/caddy
    cp "${backup_dir}/Caddyfile" deploy/homeserver/caddy/Caddyfile
  fi

  if [ -d "${backup_dir}/monitoring" ]; then
    rm -rf deploy/homeserver/monitoring
    cp -R "${backup_dir}/monitoring" deploy/homeserver/monitoring
  elif [ -f "${backup_dir}/metadata.env" ]; then
    rollback_mon_sha="$(awk -F= '$1 == "baseline_deploy_sha" { print substr($0, index($0, "=") + 1) }' "${backup_dir}/metadata.env" | tr -d '\r' | tail -n 1)"
    if [ -z "${rollback_mon_sha}" ]; then
      rollback_mon_sha="$(awk -F= '$1 == "git_head" { print substr($0, index($0, "=") + 1) }' "${backup_dir}/metadata.env" | tr -d '\r' | tail -n 1)"
    fi
    if printf '%s' "${rollback_mon_sha}" | grep -qE '^[0-9a-f]{40}$' && git cat-file -e "${rollback_mon_sha}:deploy/homeserver/monitoring" 2>/dev/null; then
      rm -rf deploy/homeserver/monitoring
      git archive "${rollback_mon_sha}" deploy/homeserver/monitoring | tar -x
    fi
  fi

  find deploy/homeserver/caddy deploy/homeserver/monitoring -type d -exec chmod 0755 {} + 2>/dev/null || true
  find deploy/homeserver/caddy deploy/homeserver/monitoring -type f -exec chmod 0644 {} + 2>/dev/null || true
}

run_backup_rollback() {
  local reason="${1:-unexpected_exit}"
  if [ -z "${BACKUP_DIR:-}" ] || [ ! -d "${BACKUP_DIR}" ]; then
    return 0
  fi

  echo "rollback from backup: ${BACKUP_DIR} (reason=${reason})" >&2

  if ! RUNTIME_SPLIT_ENABLED="${ROLLBACK_RUNTIME_SPLIT_ENABLED}" \
    ./deploy/homeserver/rollback_last_deploy.sh --check-profile-workspace-compatibility "${BACKUP_DIR}"; then
    echo "rollback blocked by profile workspace cutover compatibility: ${BACKUP_DIR}" >&2
    return 1
  fi

  if ! restore_backup_files_minimally "${BACKUP_DIR}"; then
    echo "minimal backup restore failed before rollback script: ${BACKUP_DIR}" >&2
  fi

  local rollback_status=0
  if ! RUNTIME_SPLIT_ENABLED="${ROLLBACK_RUNTIME_SPLIT_ENABLED}" \
    ./deploy/homeserver/rollback_last_deploy.sh "${BACKUP_DIR}"; then
    echo "rollback script failed after minimal backup restore: ${BACKUP_DIR} (reason=${reason})" >&2
    rollback_status=1
  fi
  if [ "${rollback_status}" -eq 0 ]; then
    restart_external_backup_legacy_minio_if_needed
  fi
  return "${rollback_status}"
}

rollback_from_backup_if_needed() {
  local reason="${1:-unexpected_exit}"
  if [ "${DEPLOY_COMPLETED}" = "true" ] || [ "${ROLLBACK_IN_PROGRESS}" = "true" ]; then
    return 0
  fi
  if [ "${RUNTIME_ENV_MATERIALIZED}" != "true" ]; then
    return 0
  fi
  if [ -n "${BACKUP_DIR:-}" ] && [ -d "${BACKUP_DIR}" ]; then
    ROLLBACK_IN_PROGRESS="true"
    run_backup_rollback "${reason}"
  fi
}

./deploy/homeserver/prune_external_backups.sh --dry-run
./deploy/homeserver/prune_external_backups.sh
EXTERNAL_BACKUP_DIR="$(./deploy/homeserver/create_external_backup.sh)"
echo "external backup created (pre-env-mutation): ${EXTERNAL_BACKUP_DIR}"
./deploy/homeserver/prune_external_backups.sh --dry-run
./deploy/homeserver/prune_external_backups.sh

if [ -f deploy/homeserver/.env.prod ]; then
  PRE_DEPLOY_ENV_CONTENT="$(cat deploy/homeserver/.env.prod)"
  PRE_DEPLOY_ENV_CAPTURED="true"
fi

if [ -n "${HOME_SERVER_ENV:-}" ]; then
  printf '%s\n' "${HOME_SERVER_ENV}" > deploy/homeserver/.env.prod
  remove_env_key "LEGACY_API_DOMAIN" "deploy/homeserver/.env.prod"
elif [ ! -f deploy/homeserver/.env.prod ]; then
  cp deploy/homeserver/.env.prod.example deploy/homeserver/.env.prod
  echo "deploy/homeserver/.env.prod created from example. Fill required values." >&2
  exit 1
fi

upsert_env_key "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT" "${HOME_RESTORE_PRIVACY_GATE_SCRIPT}" "deploy/homeserver/.env.prod"

# prod에서 sql.init 경로가 켜지면 부팅 실패(DO $$ 분리/DDL 충돌)로 이어질 수 있다.
remove_env_key "SPRING_SQL_INIT_SCHEMA_LOCATIONS" "deploy/homeserver/.env.prod"
remove_env_key "SPRING_SQL_INIT_DATA_LOCATIONS" "deploy/homeserver/.env.prod"
remove_env_key "SPRING_SQL_INIT_CONTINUE_ON_ERROR" "deploy/homeserver/.env.prod"
upsert_env_key "SPRING_SQL_INIT_MODE" "never" "deploy/homeserver/.env.prod"

# Same-origin topology (#1575): derive all site-scoped values from CUSTOM_PROD_BACKURL host.
# Strip path first ('/' may contain '@'), then userinfo ('user:pass@host'), then port.
PROD_SITE_BACK_URL_RAW="$(read_prod_env_value CUSTOM_PROD_BACKURL)"
PROD_SITE_BACK_HOST="${PROD_SITE_BACK_URL_RAW#*://}"
PROD_SITE_BACK_HOST="${PROD_SITE_BACK_HOST%%/*}"
PROD_SITE_BACK_HOST="${PROD_SITE_BACK_HOST##*@}"
PROD_SITE_BACK_HOST="${PROD_SITE_BACK_HOST%%:*}"
PROD_SITE_BACK_HOST="$(printf '%s' "${PROD_SITE_BACK_HOST}" | tr '[:upper:]' '[:lower:]')"
case "${PROD_SITE_BACK_HOST}" in
  blog.aquilaxk.site)
    PROD_SITE_COOKIE_DOMAIN="blog.aquilaxk.site"
    PROD_SITE_FRONT_URL="https://blog.aquilaxk.site"
    PROD_SITE_WEB_DOMAIN="blog.aquilaxk.site"
    PROD_SITE_BACK_URL="https://blog.aquilaxk.site"
    PROD_SITE_PUBLIC_EDGE_PROBE_BASE_URL="https://blog.aquilaxk.site"
    PROD_SITE_ADMIN_EMBED_ORIGINS="https://blog.aquilaxk.site"
    PROD_SITE_REVALIDATE_URL="https://blog.aquilaxk.site/api/revalidate"
    ;;
  *)
    echo "unsupported CUSTOM_PROD_BACKURL host for the prod site contract: '${PROD_SITE_BACK_HOST}'" >&2
    exit 1
    ;;
esac

upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN" "${PROD_SITE_COOKIE_DOMAIN}" "deploy/homeserver/.env.prod"
upsert_env_key "CUSTOM_PROD_FRONTURL" "${PROD_SITE_FRONT_URL}" "deploy/homeserver/.env.prod"
upsert_env_key "CUSTOM_PROD_BACKURL" "${PROD_SITE_BACK_URL}" "deploy/homeserver/.env.prod"
upsert_env_key "WEB_DOMAIN" "${PROD_SITE_WEB_DOMAIN}" "deploy/homeserver/.env.prod"
upsert_env_key "BACKEND_INTERNAL_URL" "http://caddy" "deploy/homeserver/.env.prod"
upsert_env_key "PUBLIC_EDGE_PROBE_BASE_URL" "${PROD_SITE_PUBLIC_EDGE_PROBE_BASE_URL}" "deploy/homeserver/.env.prod"
upsert_env_key "ADMIN_EMBED_ORIGINS" "${PROD_SITE_ADMIN_EMBED_ORIGINS}" "deploy/homeserver/.env.prod"
EXISTING_REVALIDATE_URL="$(read_prod_env_value CUSTOM__REVALIDATE__URL)"
if [ -n "${EXISTING_REVALIDATE_URL}" ]; then
  upsert_env_key "CUSTOM__REVALIDATE__URL" "${PROD_SITE_REVALIDATE_URL}" "deploy/homeserver/.env.prod"
fi

if [ -z "${HOME_BACK_IMAGE:-}" ]; then
  echo "HOME_BACK_IMAGE is empty. abort deploy to avoid stale image rollout." >&2
  exit 1
fi
STAGED_BACK_IMAGE="${HOME_BACK_IMAGE}"
echo "staged deploy image in shell env only: ${STAGED_BACK_IMAGE}"

preserve_pre_deploy_runtime_image_env_keys

require_nonempty_env_key "CF_TUNNEL_TOKEN"
require_digest_image_value "STAGED_BACK_IMAGE" "${STAGED_BACK_IMAGE}"
ensure_image_key_from_local_digest "CLOUDFLARED_IMAGE" "cloudflare/cloudflared:latest"
ensure_image_key_from_local_digest "AUTOHEAL_IMAGE" "willfarrell/autoheal:latest"
ensure_image_key_from_local_digest "DOCKER_SOCKET_PROXY_IMAGE" "tecnativa/docker-socket-proxy:0.3.0"
ensure_image_key_from_local_digest "CADDY_IMAGE" "caddy:2.8-alpine"
ensure_image_key_from_local_digest "UPTIME_KUMA_IMAGE" "louislam/uptime-kuma:1"
ensure_image_key_from_local_digest "PROMETHEUS_IMAGE" "prom/prometheus:v2.54.1"
ensure_image_key_from_local_digest "ALERTMANAGER_IMAGE" "prom/alertmanager:v0.27.0"
ensure_image_key_from_local_digest "POSTGRES_EXPORTER_IMAGE" "quay.io/prometheuscommunity/postgres-exporter:v0.20.1"
ensure_image_key_from_local_digest "GRAFANA_IMAGE" "grafana/grafana:11.2.2"
ensure_image_key_from_local_digest "LOKI_IMAGE" "grafana/loki:3.0.0"
ensure_image_key_from_local_digest "PROMTAIL_IMAGE" "grafana/promtail:3.0.0"
ensure_image_key_from_local_digest "NODE_RUNTIME_IMAGE" "node:20-alpine"
ensure_image_key_from_local_digest "DB_IMAGE" "jangka512/pgj:latest"
ensure_image_key_from_local_digest "REDIS_IMAGE" "redis:7-alpine"
require_digest_image_key "CLOUDFLARED_IMAGE"
require_digest_image_key "AUTOHEAL_IMAGE"
require_digest_image_key "DOCKER_SOCKET_PROXY_IMAGE"
require_digest_image_key "CADDY_IMAGE"
require_digest_image_key "UPTIME_KUMA_IMAGE"
require_digest_image_key "PROMETHEUS_IMAGE"
require_digest_image_key "ALERTMANAGER_IMAGE"
require_digest_image_key "POSTGRES_EXPORTER_IMAGE"
require_digest_image_key "GRAFANA_IMAGE"
require_digest_image_key "LOKI_IMAGE"
require_digest_image_key "PROMTAIL_IMAGE"
require_digest_image_key "NODE_RUNTIME_IMAGE"
require_digest_image_key "DB_IMAGE"
require_digest_image_key "REDIS_IMAGE"
require_digest_image_key "MINIO_IMAGE"
require_digest_image_key "MINIO_MC_IMAGE"

# The application identity must exist before any backend is recreated with it.
RUNTIME_ENV_MATERIALIZED="true"
if ! docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml up -d minio_1; then
  echo "failed to start MinIO for service identity preparation" >&2
  exit 1
fi
if ! "./deploy/homeserver/minio_service_identity.sh" prepare "deploy/homeserver/.env.prod" "blog_home_data"; then
  echo "failed to prepare MinIO application identity" >&2
  exit 1
fi

if ! STAGED_BACK_IMAGE="${STAGED_BACK_IMAGE}" ./deploy/homeserver/pgroonga_precheck.sh; then
  exit 1
fi

if ! STAGED_BACK_IMAGE="${STAGED_BACK_IMAGE}" ./deploy/homeserver/post_precheck_env_guard.sh; then
  exit 1
fi

if [ -z "${HOME_GHCR_USERNAME:-}" ] || [ -z "${HOME_GHCR_TOKEN:-}" ]; then
  echo "HOME_GHCR_USERNAME and HOME_GHCR_TOKEN are required for private GHCR deploy" >&2
  exit 1
fi
echo "${HOME_GHCR_TOKEN}" | docker login ghcr.io -u "${HOME_GHCR_USERNAME}" --password-stdin

RUNTIME_SPLIT_ENABLED_VALUE="$(extract_env_value "RUNTIME_SPLIT_ENABLED")"
RUNTIME_SPLIT_STAGE_VALUE="$(extract_env_value "RUNTIME_SPLIT_STAGE")"
if [ -z "${RUNTIME_SPLIT_ENABLED_VALUE}" ]; then
  RUNTIME_SPLIT_ENABLED_VALUE="false"
fi
if [ -z "${RUNTIME_SPLIT_STAGE_VALUE}" ]; then
  RUNTIME_SPLIT_STAGE_VALUE="A"
fi
ROLLBACK_RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED_VALUE}"
echo "runtime split from HOME_SERVER_ENV: enabled=${RUNTIME_SPLIT_ENABLED_VALUE} stage=${RUNTIME_SPLIT_STAGE_VALUE}"

rollback_and_exit() {
  local reason="$1"
  ROLLBACK_IN_PROGRESS="true"
  echo "deploy verification failed: ${reason}" >&2
  emit_post_deploy_diagnostics
  if [ -n "${BACKUP_DIR:-}" ] && [ -d "${BACKUP_DIR}" ]; then
    ROLLBACK_RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED_VALUE}"
    run_backup_rollback "${reason}"
  fi
  exit 1
}

ensure_monitoring_bind_mount_permissions

RUNTIME_ENV_MATERIALIZED="true"
if ! HOME_DEPLOY_SHA="${HOME_DEPLOY_SHA}" STAGED_BACK_IMAGE="${STAGED_BACK_IMAGE}" BACKUP_FLYWAY_SCHEMA_VERSION="${BACKUP_FLYWAY_SCHEMA_VERSION}" RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED_VALUE}" RUNTIME_SPLIT_STAGE="${RUNTIME_SPLIT_STAGE_VALUE}" HEALTHCHECK_PATH=/actuator/health/readiness HEALTHCHECK_LOG_EVERY_N_TRIES=1 CANDIDATE_HEALTHCHECK_RETRIES=450 ./deploy/homeserver/blue_green_deploy.sh; then
  rollback_and_exit "blue_green_deploy_failed"
fi

verify_active_backend_and_edge

# Public HTTPS gate. Unlike the host-header probe above this one crosses DNS, Cloudflare
# and the tunnel, so it is the check that fails when the site is down for real visitors.
if ! wait_public_api_health "${WEB_DOMAIN}"; then
  rollback_and_exit "public_api_healthcheck_failed"
fi

if ! assert_live_security_headers \
  "public-feed" \
  "https://${WEB_DOMAIN}/post/api/v1/posts/feed?page=1&pageSize=1&sort=CREATED_AT" \
  '^200$'; then
  rollback_and_exit "public_feed_security_header_smoke_failed"
fi

if ! assert_live_security_headers \
  "protected-auth-me" \
  "https://${WEB_DOMAIN}/member/api/v1/auth/me" \
  '^401$' \
  "no-store"; then
  rollback_and_exit "protected_auth_security_header_smoke_failed"
fi

FEED_URL="https://${WEB_DOMAIN}/post/api/v1/posts/feed?page=1&pageSize=30&sort=CREATED_AT"
EXPLORE_URL="https://${WEB_DOMAIN}/post/api/v1/posts/explore?kw=&tag=&sort=CREATED_AT&page=1&pageSize=30"

if ! run_canary_ratio_check "feed" "${FEED_URL}"; then
  rollback_and_exit "post_public_read_canary_feed_failed"
fi

if ! run_canary_ratio_check "explore" "${EXPLORE_URL}"; then
  rollback_and_exit "post_public_read_canary_explore_failed"
fi

DETAIL_POST_ID="$(extract_canary_post_id "${FEED_URL}" || true)"
if [ -z "${DETAIL_POST_ID}" ]; then
  rollback_and_exit "post_public_read_canary_missing_post_id"
fi
DETAIL_URL="https://${WEB_DOMAIN}/post/api/v1/posts/${DETAIL_POST_ID}"

if ! run_canary_ratio_check "detail(${DETAIL_POST_ID})" "${DETAIL_URL}"; then
  rollback_and_exit "post_public_read_canary_detail_failed"
fi

if ! "./deploy/homeserver/minio_service_identity.sh" audit "deploy/homeserver/.env.prod" "blog_home_data"; then
  rollback_and_exit "minio_service_identity_audit_failed"
fi
if ! "./deploy/homeserver/minio_service_identity.sh" finalize "deploy/homeserver/.env.prod" "blog_home_data"; then
  rollback_and_exit "minio_service_identity_finalize_failed"
fi

PROFILE_WORKSPACE_BASELINE_MARKER_SHA="$(docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T db_1 psql -U postgres -d "$(resolve_active_prod_db_name)" -Atq -v ON_ERROR_STOP=1 -c "SELECT COALESCE((SELECT source_sha FROM public.platform_schema_cutover WHERE cutover_id = 'profile-workspace-legacy-attrs'), '')" 2>/dev/null | tr -d '\r')" || rollback_and_exit "profile_workspace_cutover_marker_read_failed"
if [ -z "${PROFILE_WORKSPACE_BASELINE_MARKER_SHA}" ]; then
  PROFILE_WORKSPACE_BASELINE_MARKER_SHA="${HOME_DEPLOY_SHA}"
fi
if [[ ! "${PROFILE_WORKSPACE_BASELINE_MARKER_SHA}" =~ ^[0-9a-f]{40}$ ]] || ! git merge-base --is-ancestor "${PROFILE_WORKSPACE_BASELINE_MARKER_SHA}" "${HOME_DEPLOY_SHA}"; then
  rollback_and_exit "profile_workspace_cutover_marker_incompatible"
fi

if ! DEPLOY_BASELINE_SHA="${HOME_DEPLOY_SHA}" PROFILE_WORKSPACE_CUTOVER_SHA="${PROFILE_WORKSPACE_BASELINE_MARKER_SHA}" ./deploy/homeserver/record_deploy_baseline.sh --stage-pending; then
  rollback_and_exit "profile_workspace_baseline_stage_failed"
fi

if ! docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T db_1 psql -U postgres -d "$(resolve_active_prod_db_name)" -Atq -v ON_ERROR_STOP=1 -v cutover_sha="${HOME_DEPLOY_SHA}" -v expected_marker_sha="${PROFILE_WORKSPACE_BASELINE_MARKER_SHA}" -f - < deploy/homeserver/sql/retire_profile_workspace_legacy.sql >/dev/null 2>&1; then
  rollback_and_exit "profile_workspace_legacy_retirement_failed"
fi

DEPLOY_COMPLETED="true"
rm -f deploy/homeserver/.external-minio-migration-stopped

# Publish only the exact baseline staged before retirement. DEPLOY_COMPLETED
# prevents a post-commit publication failure from crossing the cutover marker.
if DEPLOY_BASELINE_DIR="$(PROFILE_WORKSPACE_CUTOVER_SHA="${PROFILE_WORKSPACE_BASELINE_MARKER_SHA}" ./deploy/homeserver/record_deploy_baseline.sh --publish-pending)"; then
  echo "deploy baseline recorded: ${DEPLOY_BASELINE_DIR}"
else
  # On stdout, not stderr, so the runner parses it as a workflow annotation:
  # a silently repeated failure leaves rollback pinned to an ever-older point.
  echo "::warning title=Deploy baseline not recorded::healthy deploy remains active, but the next deploy and rollback are blocked until a marker-compatible baseline is recorded"
fi

cleanup_remote_tmp
trap - EXIT
