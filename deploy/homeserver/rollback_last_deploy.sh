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
NETWORK_NAME="blog_home_default"
DEPLOY_LOCK_DIR="${SCRIPT_DIR}/.deploy.lock"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/actuator/health/readiness}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-20}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_MAX_TIME_SECONDS="${HEALTHCHECK_MAX_TIME_SECONDS:-5}"
RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED:-false}"

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

container_image_for_service_any_state() {
  local service="$1"
  local container_id
  container_id="$(
    docker ps -aq \
      --filter "label=com.docker.compose.project=blog_home" \
      --filter "label=com.docker.compose.service=${service}" 2>/dev/null | head -n 1 || true
  )"
  if [[ -z "${container_id}" ]]; then
    return 0
  fi

  docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

repair_back_image_if_missing() {
  local current_value repaired_value metadata_image
  current_value="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -n "${current_value}" ]]; then
    echo "rollback BACK_IMAGE preserved: ${current_value}"
    return 0
  fi

  metadata_image="$(trim_quotes "$(backup_metadata_value "active_backend_image")")"
  if [[ -n "${metadata_image}" ]]; then
    repaired_value="${metadata_image}"
    echo "rollback BACK_IMAGE repair source=backup_metadata image=${repaired_value}"
  fi

  if [[ -z "${repaired_value}" && -n "${target_backend:-}" ]]; then
    repaired_value="$(container_image_for_service_any_state "${target_backend}" || true)"
    if [[ -n "${repaired_value}" ]]; then
      echo "rollback BACK_IMAGE repair source=target_backend_container backend=${target_backend} image=${repaired_value}"
    fi
  fi

  if [[ -z "${repaired_value}" && -n "${inactive_backend:-}" ]]; then
    repaired_value="$(container_image_for_service_any_state "${inactive_backend}" || true)"
    if [[ -n "${repaired_value}" ]]; then
      echo "rollback BACK_IMAGE repair source=inactive_backend_container backend=${inactive_backend} image=${repaired_value}"
    fi
  fi

  if [[ -z "${repaired_value}" ]]; then
    echo "rollback failed: BACK_IMAGE missing in restored env and no repair source available" >&2
    return 1
  fi

  upsert_env_key "BACK_IMAGE" "${repaired_value}"
  echo "rollback repaired missing BACK_IMAGE=${repaired_value}"
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

probe_backend_http_code() {
  local backend="$1"
  local host
  host="$(backend_http_host "${backend}")"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" \
    -H "Host: localhost" \
    "http://${host}:8080${HEALTHCHECK_PATH}" || true
}

wait_backend_ready() {
  local backend="$1"
  local attempt=1
  while [[ "${attempt}" -le "${HEALTHCHECK_RETRIES}" ]]; do
    local code
    code="$(probe_backend_http_code "${backend}")"
    if [[ "${code}" == "200" ]]; then
      echo "rollback backend ready: ${backend} (status=${code})"
      return 0
    fi
    echo "rollback backend pending: ${backend} (try ${attempt}/${HEALTHCHECK_RETRIES}, status=${code:-none})"
    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done
  echo "rollback backend healthcheck failed: ${backend}" >&2
  compose logs --no-color --tail=120 "${backend}" >&2 || true
  return 1
}

set_caddy_upstream_backend() {
  local backend="$1"
  local active_host
  active_host="$(backend_http_host "${backend}")"
  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    upsert_env_key "ADMIN_API_UPSTREAM" "${active_host}"
    upsert_env_key "READ_API_UPSTREAM" "${active_host}"
  fi
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

for file in .env.prod docker-compose.prod.yml .active_backend; do
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

# normalize legacy upstream tokens before rollback target is chosen
if [[ -f "${CADDY_FILE}" ]]; then
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
services_to_boot=(db_1 redis_1 caddy cloudflared uptime_kuma autoheal)
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  services_to_boot+=(back_read back_admin back_worker)
fi
compose_up_with_retry "${services_to_boot[@]}"
compose_up_no_deps_with_retry prometheus grafana
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
echo "rollback completed: active=${target_backend}, inactive stopped=${inactive_backend}"

compose ps
