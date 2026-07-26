#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
BACKUP_ROOT="${SCRIPT_DIR}/.deploy-backups"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
CADDY_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
EDGE_NETWORK_NAME="blog_home_edge"
APP_NETWORK_NAME="blog_home_app"
DATA_NETWORK_NAME="blog_home_data"
OBSERVE_NETWORK_NAME="blog_home_observe"
DEFAULT_NETWORK_NAME="blog_home_default"
NETWORK_NAME="${EDGE_NETWORK_NAME}"
DEPLOY_LOCK_DIR="${SCRIPT_DIR}/.deploy.lock"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/actuator/health/readiness}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-20}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_MAX_TIME_SECONDS="${HEALTHCHECK_MAX_TIME_SECONDS:-5}"
RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED:-false}"
COMPOSE_IMAGE_METADATA_KEYS=(AUTOHEAL_IMAGE DOCKER_SOCKET_PROXY_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE UPTIME_KUMA_IMAGE PROMETHEUS_IMAGE ALERTMANAGER_IMAGE POSTGRES_EXPORTER_IMAGE GRAFANA_IMAGE LOKI_IMAGE PROMTAIL_IMAGE NODE_RUNTIME_IMAGE DB_IMAGE REDIS_IMAGE MINIO_IMAGE)

normalize_bool() {
  local raw="$1"
  case "$(echo "${raw}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

RUNTIME_SPLIT_ENABLED="$(normalize_bool "${RUNTIME_SPLIT_ENABLED}")"

resolve_compose_profiles() {
  local profiles="${COMPOSE_PROFILES:-}"
  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    echo "${profiles}"
    return
  fi

  if [[ -z "${profiles}" ]]; then
    echo "runtime-split"
    return
  fi

  if [[ ",${profiles}," == *",runtime-split,"* ]]; then
    echo "${profiles}"
    return
  fi

  echo "${profiles},runtime-split"
}

compose() {
  local profiles
  bash "${SCRIPT_DIR}/materialize_service_env.sh" "${ENV_FILE}"
  profiles="$(resolve_compose_profiles)"
  if [[ -n "${profiles}" ]]; then
    COMPOSE_PROFILES="${profiles}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
    return
  fi
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

acquire_deploy_lock() {
  if mkdir "${DEPLOY_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${DEPLOY_LOCK_DIR}/pid" 2>/dev/null || true
    return 0
  fi
  local lock_pid
  lock_pid="$(cat "${DEPLOY_LOCK_DIR}/pid" 2>/dev/null || true)"
  if [[ "${lock_pid}" =~ ^[0-9]+$ ]] && ! kill -0 "${lock_pid}" 2>/dev/null; then
    echo "removing stale deploy lock: ${DEPLOY_LOCK_DIR} pid=${lock_pid}" >&2
    rm -rf "${DEPLOY_LOCK_DIR}" 2>/dev/null || true
    if mkdir "${DEPLOY_LOCK_DIR}" 2>/dev/null; then
      printf '%s\n' "$$" > "${DEPLOY_LOCK_DIR}/pid" 2>/dev/null || true
      return 0
    fi
  fi
  echo "rollback blocked: deploy lock already exists: ${DEPLOY_LOCK_DIR} pid=${lock_pid:-unknown}" >&2
  return 1
}

release_deploy_lock() {
  rm -rf "${DEPLOY_LOCK_DIR}" 2>/dev/null || true
}

warn_unsupported_docker_engine() {
  local version
  version="$(docker version --format '{{.Server.Version}}' 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "${version}" ]]; then
    echo "warning: failed to detect docker engine version during rollback" >&2
    return 0
  fi
  if [[ "${version}" =~ ^29\.1\.0([.-]|$) ]]; then
    echo "warning: docker engine ${version} has known networking regression; rollback continues for emergency recovery" >&2
  fi
  echo "docker engine version detected: ${version}"
}

compose_up_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d "$@" 2>&1)"; then
      echo "${output}"
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

compose_up_force_recreate_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d --force-recreate "$@" 2>&1)"; then
      echo "${output}"
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up --force-recreate retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up --force-recreate failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

compose_up_no_deps_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d --no-deps "$@" 2>&1)"; then
      echo "${output}"
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up --no-deps retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up --no-deps failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      print value
    }
  ' "${ENV_FILE}" | tail -n 1
}

backup_metadata_value() {
  local key="$1"
  local metadata_file="${BACKUP_DIR}/metadata.env"
  if [[ ! -f "${metadata_file}" ]]; then
    return 0
  fi
  awk -F= -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      print value
    }
  ' "${metadata_file}" | tail -n 1
}

upsert_env_key() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    grep -vE "^${key}=" "${ENV_FILE}" > "${ENV_FILE}.tmp"
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "${value}"
}

compose_container_id_any_state() {
  local service="$1"
  docker ps -aq \
    --filter "label=com.docker.compose.project=blog_home" \
    --filter "label=com.docker.compose.service=${service}" 2>/dev/null | head -n 1 || true
}

container_image_for_service_any_state() {
  local service="$1"
  local container_id
  container_id="$(compose_container_id_any_state "${service}")"
  if [[ -z "${container_id}" ]]; then
    return 0
  fi

  docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

backend_image_key() {
  local service="$1"
  case "${service}" in
    back_blue) echo "BACK_BLUE_IMAGE" ;;
    back_green) echo "BACK_GREEN_IMAGE" ;;
    back_read) echo "BACK_READ_IMAGE" ;;
    back_admin) echo "BACK_ADMIN_IMAGE" ;;
    back_worker) echo "BACK_WORKER_IMAGE" ;;
    *)
      echo "unknown backend runtime service: ${service}" >&2
      return 1
      ;;
  esac
}

backup_image_key_for_service() {
  local service="$1"
  case "${service}" in
    back_blue) echo "back_blue_image" ;;
    back_green) echo "back_green_image" ;;
    back_read) echo "back_read_image" ;;
    back_admin) echo "back_admin_image" ;;
    back_worker) echo "back_worker_image" ;;
    *) return 1 ;;
  esac
}

require_digest_image_value() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "required image value is missing: ${key}" >&2
    return 1
  fi
  if [[ "${value}" == *":latest" || "${value}" == *":latest@"* ]]; then
    echo "latest tag is not allowed for ${key}: ${value}" >&2
    return 1
  fi
  if [[ ! "${value}" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]; then
    echo "image must be pinned by sha256 digest for ${key}: ${value}" >&2
    return 1
  fi
}

repair_runtime_back_image_if_missing() {
  local service="$1"
  local fallback="$2"
  local key metadata_key repaired_value metadata_image legacy_image
  repaired_value=""
  metadata_image=""
  legacy_image=""
  key="$(backend_image_key "${service}")"
  metadata_key="$(backup_image_key_for_service "${service}" || true)"
  if [[ -n "${metadata_key}" ]]; then
    metadata_image="$(trim_quotes "$(backup_metadata_value "${metadata_key}")")"
  fi
  if [[ -z "${metadata_image}" && "${service}" == "${target_backend:-}" ]]; then
    metadata_image="$(trim_quotes "$(backup_metadata_value "active_backend_image")")"
  fi
  if [[ -n "${metadata_image}" ]]; then
    require_digest_image_value "${key}" "${metadata_image}"
    upsert_env_key "${key}" "${metadata_image}"
    echo "rollback ${key} restored from backup_metadata: ${metadata_image}"
    return 0
  fi

  if [[ -z "${repaired_value}" ]]; then
    repaired_value="${fallback}"
    if [[ -n "${repaired_value}" ]]; then
      echo "rollback ${key} repair source=backup_fallback image=${repaired_value}"
    fi
  fi

  if [[ -z "${repaired_value}" ]]; then
    repaired_value="$(container_image_for_service_any_state "${service}" || true)"
    if [[ -n "${repaired_value}" ]]; then
      echo "rollback ${key} repair source=${service}_container image=${repaired_value}"
    fi
  fi

  if [[ -z "${repaired_value}" ]]; then
    legacy_image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
    if [[ -n "${legacy_image}" ]]; then
      repaired_value="${legacy_image}"
      echo "rollback ${key} repair source=legacy_BACK_IMAGE image=${repaired_value}"
    fi
  fi

  require_digest_image_value "${key}" "${repaired_value}"
  upsert_env_key "${key}" "${repaired_value}"
  echo "rollback repaired missing ${key}=${repaired_value}"
}

repair_back_image_if_missing() {
  local target_image
  target_image="$(container_image_for_service_any_state "${target_backend}" || true)"
  if [[ -z "${target_image}" ]]; then
    target_image="$(trim_quotes "$(backup_metadata_value "active_backend_image")")"
  fi
  if [[ -z "${target_image}" ]]; then
    target_image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  fi
  if [[ -z "${target_image}" ]]; then
    echo "rollback failed: no target backend image repair source available" >&2
    return 1
  fi

  repair_runtime_back_image_if_missing "${target_backend}" "${target_image}"
  repair_runtime_back_image_if_missing "${inactive_backend}" "${target_image}"
  repair_runtime_back_image_if_missing "back_read" "${target_image}"
  repair_runtime_back_image_if_missing "back_admin" "${target_image}"
  repair_runtime_back_image_if_missing "back_worker" "${target_image}"
}

restore_compose_image_metadata() {
  local key value
  for key in "${COMPOSE_IMAGE_METADATA_KEYS[@]}"; do
    value="$(trim_quotes "$(backup_metadata_value "${key}")")"
    if [[ -n "${value}" ]]; then
      require_digest_image_value "${key}" "${value}"
      upsert_env_key "${key}" "${value}"
      echo "rollback ${key} restored from backup_metadata: ${value}"
    fi
  done
}

resolve_prod_db_name() {
  local db_name

  db_name="$(trim_quotes "$(env_value "custom.prod.dbName")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  db_name="$(trim_quotes "$(env_value "CUSTOM_PROD_DBNAME")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  local db_base_name
  db_base_name="$(trim_quotes "$(env_value "DB_BASE_NAME")")"
  if [[ -z "${db_base_name}" ]]; then
    db_base_name="blog"
  fi
  echo "${db_base_name}_prod"
}

ensure_db_runtime_guards() {
  local db_name
  db_name="$(resolve_prod_db_name)"

  local guard_sql
  guard_sql=$'
ALTER TABLE IF EXISTS public.post ADD COLUMN IF NOT EXISTS content_html TEXT;

DO $$
BEGIN
  IF to_regclass('"'"'public.post_like'"'"') IS NOT NULL AND to_regclass('"'"'public.post_like_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_like_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_like), 1), false);
  END IF;
  IF to_regclass('"'"'public.post_attr'"'"') IS NOT NULL AND to_regclass('"'"'public.post_attr_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_attr_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_attr), 1), false);
  END IF;
  IF to_regclass('"'"'public.post_comment'"'"') IS NOT NULL AND to_regclass('"'"'public.post_comment_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_comment_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_comment), 1), false);
  END IF;
  IF to_regclass('"'"'public.member_attr'"'"') IS NOT NULL AND to_regclass('"'"'public.member_attr_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.member_attr_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.member_attr), 1), false);
  END IF;
  IF to_regclass('"'"'public.task'"'"') IS NOT NULL AND to_regclass('"'"'public.task_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.task_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.task), 1), false);
  END IF;
END $$;
'

  if compose exec -T db_1 psql -U postgres -d "${db_name}" -v ON_ERROR_STOP=1 -c "${guard_sql}" >/dev/null 2>&1; then
    echo "schema/sequence guard ok in ${db_name}"
    return 0
  fi

  echo "schema/sequence guard warning: failed in ${db_name}; continuing rollback" >&2
  return 1
}

reload_caddy() {
  compose exec -T caddy caddy reload --config "${CADDY_CONTAINER_FILE}" || true
}

normalize_backend_name() {
  local value="$1"
  value="${value//-/_}"
  echo "${value}"
}

host_env_value() {
  local key="$1"
  trim_quotes "$(env_value "${key}")"
}

mounted_env_value() {
  local key="$1"
  compose exec -T caddy sh -lc "printenv ${key}" 2>/dev/null | tr -d '\r' | head -n 1
}

resolve_caddy_upstream_token() {
  local token="$1"
  local scope="${2:-host}"

  if [[ "${token}" =~ ^([a-zA-Z0-9_-]+):8080$ ]]; then
    normalize_backend_name "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "${token}" =~ ^\{\$([A-Z0-9_]+):([a-zA-Z0-9_-]+)\}:8080$ ]]; then
    local key="${BASH_REMATCH[1]}"
    local default_value
    local resolved_value
    default_value="$(normalize_backend_name "${BASH_REMATCH[2]}")"
    if [[ "${scope}" == "mounted" ]]; then
      resolved_value="$(normalize_backend_name "$(mounted_env_value "${key}")")"
    else
      resolved_value="$(normalize_backend_name "$(host_env_value "${key}")")"
    fi
    if [[ -n "${resolved_value}" ]]; then
      echo "${resolved_value}"
      return 0
    fi
    echo "${default_value}"
    return 0
  fi

  return 1
}

current_caddy_upstream_host() {
  local token
  token="$(awk '$1 == "reverse_proxy" && $2 ~ /^(back[-_](blue|green|read|admin):8080|\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080)$/ {print $2; exit}' "${CADDY_FILE}")"
  resolve_caddy_upstream_token "${token}" "host" || true
}

current_caddy_mounted_upstream_host() {
  local token
  token="$(compose exec -T caddy awk '$1 == "reverse_proxy" && $2 ~ /^(back[-_](blue|green|read|admin):8080|\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080)$/ {print $2; exit}' "${CADDY_CONTAINER_FILE}" 2>/dev/null | tr -d '\r' | head -n 1)"
  resolve_caddy_upstream_token "${token}" "mounted" || true
}

caddy_mounted_has_legacy_back_active() {
  compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}"
}

host_caddy_sha256() {
  sha256sum "${CADDY_FILE}" 2>/dev/null | awk '{print $1}' | tr -d '\r'
}

mounted_caddy_sha256() {
  compose exec -T caddy sh -lc "sha256sum ${CADDY_CONTAINER_FILE} | awk '{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1
}

ensure_caddy_mount_sync() {
  local host_upstream mounted_upstream legacy_token host_hash mounted_hash
  host_upstream="$(current_caddy_upstream_host)"
  mounted_upstream="$(current_caddy_mounted_upstream_host)"
  host_hash="$(host_caddy_sha256)"
  mounted_hash="$(mounted_caddy_sha256)"
  legacy_token="false"
  if caddy_mounted_has_legacy_back_active; then
    legacy_token="true"
  fi

  if [[ "${legacy_token}" == "false" && -n "${host_upstream}" && "${host_upstream}" == "${mounted_upstream}" && -n "${host_hash}" && -n "${mounted_hash}" && "${host_hash}" == "${mounted_hash}" ]]; then
    echo "rollback caddy config sync ok: upstream=${mounted_upstream}, sha256=${mounted_hash}"
    return 0
  fi

  echo "rollback caddy config drift detected: host=${host_upstream:-none}, mounted=${mounted_upstream:-none}, host_sha=${host_hash:-none}, mounted_sha=${mounted_hash:-none}, legacy_back_active=${legacy_token}" >&2
  echo "rollback force-recreate caddy to re-mount config directory" >&2
  compose up -d --force-recreate caddy >/dev/null
  reload_caddy

  mounted_upstream="$(current_caddy_mounted_upstream_host)"
  mounted_hash="$(mounted_caddy_sha256)"
  legacy_token="false"
  if caddy_mounted_has_legacy_back_active; then
    legacy_token="true"
  fi

  if [[ "${legacy_token}" == "false" && -n "${host_upstream}" && "${host_upstream}" == "${mounted_upstream}" && -n "${host_hash}" && -n "${mounted_hash}" && "${host_hash}" == "${mounted_hash}" ]]; then
    echo "rollback caddy config sync repaired: upstream=${mounted_upstream}, sha256=${mounted_hash}"
    return 0
  fi

  echo "rollback caddy config sync failed after recreate: host=${host_upstream:-none}, mounted=${mounted_upstream:-none}, host_sha=${host_hash:-none}, mounted_sha=${mounted_hash:-none}, legacy_back_active=${legacy_token}" >&2
  compose logs --no-color --tail=120 caddy >&2 || true
  return 1
}

latest_backup() {
  ls -1dt "${BACKUP_ROOT}"/* 2>/dev/null | head -n 1
}

# Make the restore point auditable: a backup sourced from the successful-deploy baseline
# names the commit it restores, while a worktree-sourced backup is only as good as what
# the previous run left behind.
log_backup_restore_provenance() {
  local restore_source deploy_sha created_at
  restore_source="$(trim_quotes "$(backup_metadata_value "restore_source")")"
  deploy_sha="$(trim_quotes "$(backup_metadata_value "baseline_deploy_sha")")"
  created_at="$(trim_quotes "$(backup_metadata_value "baseline_created_at")")"
  echo "rollback restore point: source=${restore_source:-worktree} baseline_deploy_sha=${deploy_sha:-unknown} baseline_created_at=${created_at:-unknown}"
}

backend_http_host() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_blue"
    return
  fi
  echo "back_green"
}

other_backend() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_green"
    return
  fi
  echo "back_blue"
}

is_backend_running() {
  local backend="$1"
  compose ps --status running --services 2>/dev/null | grep -qx "${backend}"
}

stop_backend_if_running() {
  local backend="$1"
  if is_backend_running "${backend}"; then
    compose stop "${backend}" || true
    echo "rollback stop inactive backend: ${backend}"
    return
  fi
  echo "rollback inactive backend already stopped: ${backend}"
}

container_attached_networks() {
  local container_id="$1"
  if [[ -z "${container_id}" ]]; then
    return 0
  fi
  docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "${container_id}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

# Rollback restores the backup compose file, which may describe a different network
# topology than the running deployment: a backup taken before the edge/app/data/observe
# split has no networks section at all, so every recreated service lands on
# ${DEFAULT_NETWORK_NAME}. Probing a hardcoded network then reports status 000 for a
# perfectly healthy backend, so resolve the probe network from the container compose
# actually created.
resolve_backend_probe_network() {
  local backend="$1"
  local networks fallback
  networks="$(container_attached_networks "$(compose_container_id_any_state "${backend}")")"
  if [[ " ${networks} " == *" ${APP_NETWORK_NAME} "* ]]; then
    echo "${APP_NETWORK_NAME}"
    return 0
  fi
  fallback="$(awk '{print $1}' <<< "${networks}")"
  if [[ -z "${fallback}" ]]; then
    echo "${APP_NETWORK_NAME}"
    return 0
  fi
  echo "rollback backend probe network drift: ${backend} is not attached to ${APP_NETWORK_NAME}; probing via ${fallback}" >&2
  echo "${fallback}"
}

emit_rollback_backend_diagnostics() {
  local backend="$1"
  local probe_network="${2:-${APP_NETWORK_NAME}}"
  local container_id network

  echo "----- rollback ${backend} diagnostics -----"
  echo "rollback probe network used=${probe_network} expected=${APP_NETWORK_NAME}"
  compose ps -a || true

  container_id="$(compose_container_id_any_state "${backend}")"
  if [[ -n "${container_id}" ]]; then
    docker inspect --format "${backend} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}" "${container_id}" || true
    echo "${backend} networks=$(container_attached_networks "${container_id}")"
  else
    echo "${backend} container=none"
  fi

  container_id="$(compose_container_id_any_state db_1)"
  if [[ -n "${container_id}" ]]; then
    docker inspect --format "db_1 status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}} exit={{.State.ExitCode}} started={{.State.StartedAt}}" "${container_id}" || true
    echo "db_1 networks=$(container_attached_networks "${container_id}")"
  else
    echo "db_1 container=none"
  fi

  for network in "${EDGE_NETWORK_NAME}" "${APP_NETWORK_NAME}" "${DATA_NETWORK_NAME}" "${OBSERVE_NETWORK_NAME}" "${DEFAULT_NETWORK_NAME}"; do
    if docker network inspect "${network}" >/dev/null 2>&1; then
      echo "network ${network} containers=$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "${network}" 2>/dev/null | tr -d '\r')"
    else
      echo "network ${network} absent"
    fi
  done

  compose logs --no-color --tail=120 "${backend}" || true
  echo "----- end rollback ${backend} diagnostics -----"
}

probe_backend_http_code() {
  local backend="$1"
  local network="${2:-${APP_NETWORK_NAME}}"
  local host
  host="$(backend_http_host "${backend}")"
  docker run --rm --network "${network}" curlimages/curl:8.7.1 \
    --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" \
    -H "Host: localhost" \
    "http://${host}:8080${HEALTHCHECK_PATH}" || true # NOSONAR internal docker-network readiness probe; TLS terminates at the edge layer
}

wait_backend_ready() {
  local backend="$1"
  local probe_network
  probe_network="$(resolve_backend_probe_network "${backend}")"
  echo "rollback backend probe network: ${backend} via ${probe_network}"
  local attempt=1
  while [[ "${attempt}" -le "${HEALTHCHECK_RETRIES}" ]]; do
    local code
    code="$(probe_backend_http_code "${backend}" "${probe_network}")"
    if [[ "${code}" == "200" ]]; then
      echo "rollback backend ready: ${backend} (status=${code})"
      return 0
    fi
    echo "rollback backend pending: ${backend} (try ${attempt}/${HEALTHCHECK_RETRIES}, status=${code:-none})"
    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done
  echo "rollback backend healthcheck failed: ${backend}" >&2
  emit_rollback_backend_diagnostics "${backend}" "${probe_network}" >&2 || true
  return 1
}

# Any reverse_proxy/forward_auth line that targets a literal colour host instead of a
# {$READ_API_UPSTREAM}/{$ADMIN_API_UPSTREAM} placeholder. Under runtime-split such a line
# wins over the env value and takes its routes out of the split, so it must never be
# reported as a healthy placeholder edge.
caddy_file_has_literal_colour_upstream() {
  grep -Eq '^[[:space:]]*(reverse_proxy|forward_auth)[[:space:]]+back[-_](blue|green|active):8080([[:space:]]|$)' "${CADDY_FILE}"
}

set_caddy_upstream_backend() {
  local backend="$1"
  local active_host
  active_host="$(backend_http_host "${backend}")"

  # runtime-split: edge upstreams belong to READ_API_UPSTREAM/ADMIN_API_UPSTREAM, not to
  # the blue/green colour. Baking the colour into the Caddyfile makes the literal win
  # over the env placeholder and collapses read/admin isolation (#1418). The reload
  # stays so the restored config reaches the running caddy process.
  #
  # A restored backup can already carry literals, and this script has no
  # verify_caddy_route() that would notice. The file is not repaired either: the
  # literal -> placeholder direction is not recoverable from the file alone, and the git
  # HEAD available here is the failed deploy's commit, not the backup's restore point.
  # So the drift is reported here and again on the completion line.
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    reload_caddy
    if caddy_file_has_literal_colour_upstream; then
      echo "WARN rollback restored a Caddyfile with literal colour upstreams; runtime-split env routing (read=$(host_env_value "READ_API_UPSTREAM"), admin=$(host_env_value "ADMIN_API_UPSTREAM")) is not in effect for those routes" >&2
      grep -nE '^[[:space:]]*(reverse_proxy|forward_auth)[[:space:]]+back[-_](blue|green|active):8080' "${CADDY_FILE}" >&2 || true
      echo "WARN this rollback has no route verify that could catch the drift; the edge stays degraded until the placeholder Caddyfile is restored, and check_deploy_status.sh reports caddy_split_literal_upstream until then" >&2
      return 0
    fi
    echo "rollback caddy upstream kept on runtime-split placeholders: read=$(host_env_value "READ_API_UPSTREAM"), admin=$(host_env_value "ADMIN_API_UPSTREAM") (rollback colour=${active_host})"
    return 0
  fi

  upsert_env_key "ADMIN_API_UPSTREAM" "${active_host}"
  upsert_env_key "READ_API_UPSTREAM" "${active_host}"
  local rewritten
  rewritten="$(sed -E \
    -e 's/\{\$ADMIN_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/'"${active_host}"':8080/g' \
    -e 's/\{\$READ_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/'"${active_host}"':8080/g' \
    -e "s/back[-_](blue|green|active):8080( +back[-_](blue|green|active):8080)?/${active_host}:8080/g" \
    "${CADDY_FILE}")"
  printf '%s\n' "${rewritten}" > "${CADDY_FILE}"
  reload_caddy
  echo "rollback caddy upstream -> active=${active_host}:8080"
}

persist_single_runtime_caddy_upstreams() {
  local backend="$1"
  local active_host
  active_host="$(backend_http_host "${backend}")"
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    return 0
  fi
  upsert_env_key "ADMIN_API_UPSTREAM" "${active_host}"
  upsert_env_key "READ_API_UPSTREAM" "${active_host}"
  echo "rollback single-runtime caddy env upstream fixed: active=${active_host}"
}

ensure_steady_state_guard() {
  local installer="${SCRIPT_DIR}/install_steady_state_guard_cron.sh"
  if [[ ! -x "${installer}" ]]; then
    echo "steady-state guard installer missing or not executable: ${installer}" >&2
    return 1
  fi
  "${installer}"
}

BACKUP_DIR="${1:-$(latest_backup)}"

if [[ -z "${BACKUP_DIR:-}" || ! -d "${BACKUP_DIR}" ]]; then
  echo "no backup directory found" >&2
  exit 1
fi

if ! acquire_deploy_lock; then
  exit 1
fi
trap 'release_deploy_lock' EXIT INT TERM

echo "rollback from backup: ${BACKUP_DIR}"
log_backup_restore_provenance

for file in docker-compose.prod.yml .active_backend; do
  if [[ -f "${BACKUP_DIR}/${file}" ]]; then
    cp "${BACKUP_DIR}/${file}" "${SCRIPT_DIR}/${file}"
  fi
done

if [[ -d "${BACKUP_DIR}/caddy" ]]; then
  rm -rf "${SCRIPT_DIR}/caddy"
  cp -R "${BACKUP_DIR}/caddy" "${SCRIPT_DIR}/caddy"
elif [[ -f "${BACKUP_DIR}/Caddyfile" ]]; then
  mkdir -p "${SCRIPT_DIR}/caddy"
  cp "${BACKUP_DIR}/Caddyfile" "${CADDY_FILE}"
fi

if [[ ! -f "${CADDY_FILE}" ]]; then
  echo "rollback failed: caddy file missing after backup restore (${CADDY_FILE})" >&2
  exit 1
fi

restore_compose_image_metadata

# normalize legacy upstream tokens before rollback target is chosen
#
# runtime-split must be excluded. The normalization pins every literal upstream to a
# hardcoded back_blue, and the split branch of set_caddy_upstream_backend() no longer
# rewrites the file afterwards. A backup captured with back_green:8080 would therefore be
# left pointing at back_blue while target_backend stays back_green, so the rollback stops
# back_blue and hands the edge a stopped container (#1409 class). Leaving the restored
# tokens alone keeps the Caddyfile consistent with the restored .active_backend.
if [[ -f "${CADDY_FILE}" && "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
  normalized="$(sed -E "s/back[-_](blue|green|active):8080( +back[-_](blue|green|active):8080)?/back_blue:8080/g" "${CADDY_FILE}")"
  printf '%s\n' "${normalized}" > "${CADDY_FILE}"
fi

target_backend="back_blue"
if [[ -f "${STATE_FILE}" ]]; then
  from_state="$(cat "${STATE_FILE}" || true)"
  if [[ "${from_state}" == "back_blue" || "${from_state}" == "back_green" ]]; then
    target_backend="${from_state}"
  fi
fi
inactive_backend="$(other_backend "${target_backend}")"

repair_back_image_if_missing
persist_single_runtime_caddy_upstreams "${target_backend}"

warn_unsupported_docker_engine
services_to_boot=(db_1 redis_1 minio_1 caddy cloudflared uptime_kuma autoheal)
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  services_to_boot+=(back_read back_admin back_worker)
fi
compose_up_with_retry "${services_to_boot[@]}"
compose_up_no_deps_with_retry loki promtail prometheus grafana
ensure_db_runtime_guards || true
reload_caddy
ensure_caddy_mount_sync

compose_up_force_recreate_with_retry "${target_backend}"
if ! wait_backend_ready "${target_backend}"; then
  fallback_backend="$(other_backend "${target_backend}")"
  echo "rollback primary target unhealthy: ${target_backend}; trying fallback=${fallback_backend}" >&2
  compose_up_force_recreate_with_retry "${fallback_backend}"
  if wait_backend_ready "${fallback_backend}"; then
    target_backend="${fallback_backend}"
    inactive_backend="$(other_backend "${target_backend}")"
  else
    echo "rollback failed: both backends unhealthy (${target_backend}, ${fallback_backend})" >&2
    exit 1
  fi
fi

set_caddy_upstream_backend "${target_backend}"
ensure_caddy_mount_sync
stop_backend_if_running "${inactive_backend}"
ensure_steady_state_guard || true

# Report the edge the rollback actually left behind. The completion line is the only thing
# an operator reads on a long rollback log, so it must not say plain success while
# runtime-split isolation is off.
#
# The exit code deliberately stays 0. deploy.yml's run_backup_rollback() skips
# restart_external_backup_legacy_minio_if_needed() when this script exits non-zero, so
# failing here after the service is already back would leave minio stopped and stretch the
# outage instead of shortening it (#1409 class). The degraded state is detected out of band
# by check_deploy_status.sh, which fails on caddy_split_literal_upstream.
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]] && caddy_file_has_literal_colour_upstream; then
  echo "WARN rollback completed with a degraded edge: active=${target_backend}, inactive stopped=${inactive_backend}; the restored Caddyfile pins literal colour upstreams, so runtime-split read/admin isolation is off for the lines logged above until the placeholder Caddyfile is restored and a deploy reloads it" >&2
else
  echo "rollback completed: active=${target_backend}, inactive stopped=${inactive_backend}"
fi

compose ps
