#!/usr/bin/env bash
set -euo pipefail

exec </dev/null

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
COMPOSE_ENV_FILE="${ENV_FILE}"
COMPOSE_ENV_FILE_TMP=""
MIGRATION_STOPPED_FILE="${SCRIPT_DIR}/.external-minio-migration-stopped"
DEFAULT_EXTERNAL_STORAGE_ROOT="/mnt/aquila-blog-data"
TIMESTAMP="${AQUILA_BACKUP_TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}"
BACKUP_LOG_FILE=""
BACKUP_ENCRYPTION_KEY_FILE=""
STOPPED_LEGACY_MINIO_CONTAINERS=()
STOPPED_BACKUP_MINIO_CONTAINERS=()
LEGACY_MINIO_STOPPED_FOR_MIGRATION="false"
MINIO_STOPPED_FOR_BACKUP="false"
MIGRATED_MINIO_DIR_THIS_RUN=""
COMPOSE_IMAGE_ENV_PREFLIGHT_DONE="false"
COMPOSE_IMAGE_METADATA_KEYS=(AUTOHEAL_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE UPTIME_KUMA_IMAGE PROMETHEUS_IMAGE ALERTMANAGER_IMAGE POSTGRES_EXPORTER_IMAGE GRAFANA_IMAGE LOKI_IMAGE PROMTAIL_IMAGE NODE_RUNTIME_IMAGE DB_IMAGE REDIS_IMAGE MINIO_IMAGE)

read_key_from_text() {
  local key="$1"
  local text="$2"
  printf '%s\n' "${text}" | awk -F= -v k="${key}" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/^[Ee][Xx][Pp][Oo][Rr][Tt][[:space:]]+/, "", line)
      if (index(line, k "=") == 1) {
        value = substr(line, length(k) + 2)
        sub(/^[[:space:]]+/, "", value)
        sub(/[[:space:]]+$/, "", value)
        if ((value ~ /^".*"$/) || (value ~ /^'\''.*'\''$/)) {
          value = substr(value, 2, length(value) - 2)
        }
        print value
      }
    }
  ' | tail -n 1
}

has_key_in_text() {
  local key="$1"
  local text="$2"
  printf '%s\n' "${text}" | awk -F= -v k="${key}" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      sub(/^[Ee][Xx][Pp][Oo][Rr][Tt][[:space:]]+/, "", line)
      if (index(line, k "=") == 1) {
        found = 1
      }
    }
    END { exit(found ? 0 : 1) }
  '
}

read_key_from_file() {
  local key="$1"
  local file="$2"
  [[ -f "${file}" ]] || return 0
  read_key_from_text "${key}" "$(cat "${file}")"
}

env_value() {
  local key="$1"
  local default_value="${2:-}"
  local value="${!key:-}"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi
  if [[ -n "${HOME_SERVER_ENV:-}" ]]; then
    value="$(read_key_from_text "${key}" "${HOME_SERVER_ENV}")"
    if [[ -n "${value}" ]]; then
      printf '%s' "${value}"
      return 0
    fi
  fi
  value="$(read_key_from_file "${key}" "${ENV_FILE}")"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi
  printf '%s' "${default_value}"
}

env_value_from_current_file() {
  local key="$1"
  local default_value="${2:-}"
  local value
  value="$(read_key_from_file "${key}" "${ENV_FILE}")"
  if [[ -n "${value}" ]]; then
    printf '%s' "${value}"
    return 0
  fi
  printf '%s' "${default_value}"
}

trim_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "${value}"
}

is_digest_image_value() {
  local value="$1"
  [[ -n "${value}" ]] || return 1
  [[ "${value}" != *":latest" && "${value}" != *":latest@"* ]] || return 1
  [[ "${value}" =~ @sha256:[a-fA-F0-9]{64}$ ]]
}

require_digest_image_value() {
  local key="$1"
  local value="$2"
  if [[ "${value}" == *":latest" || "${value}" == *":latest@"* ]]; then
    fail "latest tag is not allowed for image env key before backup compose evaluation: ${key}=${value}"
  fi
  if [[ ! "${value}" =~ @sha256:[a-fA-F0-9]{64}$ ]]; then
    fail "image env key must include sha256 digest before backup compose evaluation: ${key}=${value}"
  fi
}

ensure_compose_env_work_file() {
  if [[ -n "${COMPOSE_ENV_FILE_TMP}" ]]; then
    return 0
  fi

  COMPOSE_ENV_FILE_TMP="$(mktemp "${TMPDIR:-/tmp}/aquila-compose-env.XXXXXX")"
  if [[ -f "${ENV_FILE}" ]]; then
    cp "${ENV_FILE}" "${COMPOSE_ENV_FILE_TMP}"
  else
    : > "${COMPOSE_ENV_FILE_TMP}"
  fi
  COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE_TMP}"
}

upsert_env_key() {
  local key="$1"
  local value="$2"
  local target="${3:-${COMPOSE_ENV_FILE}}"
  local status
  [[ -n "${value}" ]] || return 0
  touch "${target}"

  if grep -qE "^${key}=" "${target}"; then
    set +e
    grep -vE "^${key}=" "${target}" > "${target}.tmp"
    status=$?
    set -e
    [[ "${status}" -eq 0 || "${status}" -eq 1 ]] || fail "failed to filter ${key} from ${target}"
    printf '%s=%s\n' "${key}" "${value}" >> "${target}.tmp"
    mv "${target}.tmp" "${target}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${target}"
  fi
}

compose_env_quote_value() {
  local value="$1"
  local escaped=""
  local prefix=""
  while [[ "${value}" == *"'"* ]]; do
    prefix="${value%%\'*}"
    escaped+="${prefix}\\'"
    value="${value#*\'}"
  done
  escaped+="${value}"
  printf "'%s'" "${escaped}"
}

upsert_env_key_compose_quoted() {
  local key="$1"
  local value="$2"
  local target="${3:-${COMPOSE_ENV_FILE}}"
  local quoted_value
  quoted_value="$(compose_env_quote_value "${value}")"
  upsert_env_key "${key}" "${quoted_value}" "${target}"
}

stage_home_server_env_key() {
  local key="$1"
  local value
  [[ -n "${HOME_SERVER_ENV:-}" ]] || return 0
  has_key_in_text "${key}" "${HOME_SERVER_ENV}" || return 0
  value="$(read_key_from_text "${key}" "${HOME_SERVER_ENV}")"

  ensure_compose_env_work_file
  upsert_env_key_compose_quoted "${key}" "${value}"
}

stage_home_server_env_compose_values() {
  stage_home_server_env_key "ALERTMANAGER_SMTP_AUTH_PASSWORD"
  stage_home_server_env_key "ALERTMANAGER_SMTP_AUTH_USERNAME"
  stage_home_server_env_key "AQUILA_EXTERNAL_STORAGE_ROOT"
  stage_home_server_env_key "AUTOHEAL_INTERVAL_SECONDS"
  stage_home_server_env_key "AUTOHEAL_START_PERIOD_SECONDS"
  stage_home_server_env_key "BACK_ADMIN_MEM_LIMIT"
  stage_home_server_env_key "BACK_ADMIN_MEM_RESERVATION"
  stage_home_server_env_key "BACK_AUTOHEAL_ENABLED"
  stage_home_server_env_key "BACK_MEM_LIMIT"
  stage_home_server_env_key "BACK_MEM_RESERVATION"
  stage_home_server_env_key "BACK_READ_MEM_LIMIT"
  stage_home_server_env_key "BACK_READ_MEM_RESERVATION"
  stage_home_server_env_key "BACK_WORKER_MEM_LIMIT"
  stage_home_server_env_key "BACK_WORKER_MEM_RESERVATION"
  stage_home_server_env_key "CF_TUNNEL_TOKEN"
  stage_home_server_env_key "CUSTOM__MEMBER__SIGNUP__MAIL_FROM"
  stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE"
  stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE_BLUE"
  stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE_GREEN"
  stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE_WORKER"
  stage_home_server_env_key "DB_BASE_NAME"
  stage_home_server_env_key "GRAFANA_ADMIN_PASSWORD"
  stage_home_server_env_key "GRAFANA_ADMIN_USER"
  stage_home_server_env_key "GRAFANA_ROOT_URL"
  stage_home_server_env_key "MINIO_ROOT_PASSWORD"
  stage_home_server_env_key "MINIO_ROOT_USER"
  stage_home_server_env_key "OPERATIONS_ALERT_EMAIL_TO"
  stage_home_server_env_key "PROD___POSTGRES__PASSWORD"
  stage_home_server_env_key "PROD___SPRING__DATASOURCE__PASSWORD"
  stage_home_server_env_key "PROD___SPRING__DATA__REDIS__PASSWORD"
  stage_home_server_env_key "PROMETHEUS_RETENTION_TIME"
  stage_home_server_env_key "PUBLIC_EDGE_PROBE_BASE_URL"
  stage_home_server_env_key "PUBLIC_EDGE_PROBE_LATEST_POSTS"
  stage_home_server_env_key "PUBLIC_EDGE_PROBE_REFRESH_MS"
  stage_home_server_env_key "PUBLIC_EDGE_PROBE_REQUESTS"
  stage_home_server_env_key "PUBLIC_EDGE_PROBE_TIMEOUT_MS"
  stage_home_server_env_key "SPRING__MAIL__HOST"
  stage_home_server_env_key "SPRING__MAIL__PORT"
  stage_home_server_env_key "SPRING__MAIL__PROPERTIES__MAIL__SMTP__STARTTLS__ENABLE"
}

stage_backend_runtime_image_env_key() {
  local key="$1"
  local image="$2"
  require_digest_image_value "${key}" "${image}"
  ensure_compose_env_work_file
  upsert_env_key "${key}" "${image}"
  export "${key}=${image}"
}

resolve_local_repo_digest() {
  local image_ref="$1"
  docker image inspect --format '{{index .RepoDigests 0}}' "${image_ref}" 2>/dev/null | head -n 1 | tr -d '\r'
}

resolve_repo_digest_with_pull_fallback() {
  local image_ref="$1"
  local digest
  digest="$(resolve_local_repo_digest "${image_ref}" || true)"
  if [[ -n "${digest}" ]]; then
    printf '%s' "${digest}"
    return 0
  fi

  log "local digest missing for ${image_ref}; pulling fallback image before backup compose evaluation"
  docker pull "${image_ref}" >/dev/null || fail "failed to pull fallback image before backup compose evaluation: ${image_ref}"
  digest="$(resolve_local_repo_digest "${image_ref}" || true)"
  [[ -n "${digest}" ]] || fail "fallback image pull did not provide repo digest: ${image_ref}"
  printf '%s' "${digest}"
}

ensure_image_env_key_from_local_digest() {
  local key="$1"
  local fallback_image="$2"
  local value
  value="$(trim_quotes "$(env_value "${key}")")"
  if [[ -n "${value}" ]]; then
    require_digest_image_value "${key}" "${value}"
    local file_value
    file_value="$(trim_quotes "$(read_key_from_file "${key}" "${ENV_FILE}")")"
    if [[ "${value}" != "${file_value}" ]]; then
      # Keep the deploy snapshot truthful: stage HOME_SERVER_ENV or shell
      # overrides in a temporary compose env file instead of mutating .env.prod.
      ensure_compose_env_work_file
      upsert_env_key "${key}" "${value}"
    fi
    return 0
  fi

  local digest
  digest="$(resolve_repo_digest_with_pull_fallback "${fallback_image}")"
  require_digest_image_value "${key}" "${digest}"
  ensure_compose_env_work_file
  upsert_env_key "${key}" "${digest}"
  log "auto-filled ${key} from local digest (${fallback_image} -> ${digest})"
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

ensure_backend_runtime_image_env_key() {
  local key="$1"
  local service="$2"
  local value legacy_value container_value
  value="$(trim_quotes "$(env_value "${key}")")"
  if [[ -n "${value}" ]]; then
    if is_digest_image_value "${value}"; then
      stage_backend_runtime_image_env_key "${key}" "${value}"
      return 0
    fi
    log "invalid ${key} runtime image env value will try fallback sources before backup compose evaluation"
  fi

  legacy_value="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -n "${legacy_value}" ]]; then
    if is_digest_image_value "${legacy_value}"; then
      stage_backend_runtime_image_env_key "${key}" "${legacy_value}"
      log "auto-filled ${key} from legacy BACK_IMAGE for compose preflight"
      return 0
    fi
    log "invalid legacy BACK_IMAGE value will try container image before backup compose evaluation"
  fi

  container_value="$(container_image_for_service_any_state "${service}" || true)"
  if [[ -n "${container_value}" ]]; then
    stage_backend_runtime_image_env_key "${key}" "${container_value}"
    log "auto-filled ${key} from ${service} container image for compose preflight"
    return 0
  fi

  fail "required backend runtime image env key is missing: ${key}"
}

metadata_backend_image_key() {
  local key="$1"
  case "${key}" in
    BACK_BLUE_IMAGE) echo "back_blue_image" ;;
    BACK_GREEN_IMAGE) echo "back_green_image" ;;
    BACK_READ_IMAGE) echo "back_read_image" ;;
    BACK_ADMIN_IMAGE) echo "back_admin_image" ;;
    BACK_WORKER_IMAGE) echo "back_worker_image" ;;
    *) return 1 ;;
  esac
}

ensure_compose_image_env_defaults() {
  ensure_image_env_key_from_local_digest "CLOUDFLARED_IMAGE" "cloudflare/cloudflared:latest"
  ensure_image_env_key_from_local_digest "AUTOHEAL_IMAGE" "willfarrell/autoheal:1.2.0"
  ensure_image_env_key_from_local_digest "CADDY_IMAGE" "caddy:2.8-alpine"
  ensure_image_env_key_from_local_digest "UPTIME_KUMA_IMAGE" "louislam/uptime-kuma:1"
  ensure_image_env_key_from_local_digest "PROMETHEUS_IMAGE" "prom/prometheus:v2.54.1"
  ensure_image_env_key_from_local_digest "ALERTMANAGER_IMAGE" "prom/alertmanager:v0.27.0"
  ensure_image_env_key_from_local_digest "POSTGRES_EXPORTER_IMAGE" "quay.io/prometheuscommunity/postgres-exporter:v0.15.0"
  ensure_image_env_key_from_local_digest "GRAFANA_IMAGE" "grafana/grafana:11.2.2"
  ensure_image_env_key_from_local_digest "LOKI_IMAGE" "grafana/loki:3.0.0"
  ensure_image_env_key_from_local_digest "PROMTAIL_IMAGE" "grafana/promtail:3.0.0"
  ensure_image_env_key_from_local_digest "NODE_RUNTIME_IMAGE" "node:20-alpine"
  ensure_image_env_key_from_local_digest "DB_IMAGE" "jangka512/pgj:latest"
  ensure_image_env_key_from_local_digest "REDIS_IMAGE" "redis:7-alpine"
  ensure_image_env_key_from_local_digest "MINIO_IMAGE" "minio/minio:latest"
  ensure_backend_runtime_image_env_key "BACK_BLUE_IMAGE" "back_blue"
  ensure_backend_runtime_image_env_key "BACK_GREEN_IMAGE" "back_green"
  ensure_backend_runtime_image_env_key "BACK_READ_IMAGE" "back_read"
  ensure_backend_runtime_image_env_key "BACK_ADMIN_IMAGE" "back_admin"
  ensure_backend_runtime_image_env_key "BACK_WORKER_IMAGE" "back_worker"
}

log() {
  local message="[external-backup] $*"
  echo "${message}" >&2
  if [[ -n "${BACKUP_LOG_FILE}" ]]; then
    printf '%s\n' "${message}" >> "${BACKUP_LOG_FILE}"
  fi
}

fail() {
  log "$*"
  exit 1
}

is_safe_absolute_path() {
  local value="$1"
  [[ "${value}" == /* ]] || return 1
  [[ "${value}" != "/" ]] || return 1
  [[ "${value}" != *"//"* ]] || return 1
  [[ ! "${value}" =~ (^|/)\.\.?($|/) ]] || return 1
}

is_mountpoint_path() {
  local path="$1"
  if command -v mountpoint >/dev/null 2>&1; then
    mountpoint -q "${path}"
    return $?
  fi
  return 0
}

validate_paths() {
  is_safe_absolute_path "${EXTERNAL_STORAGE_ROOT}" || fail "unsafe AQUILA_EXTERNAL_STORAGE_ROOT=${EXTERNAL_STORAGE_ROOT}"
  is_safe_absolute_path "${BACKUP_ROOT}" || fail "unsafe AQUILA_BACKUP_ROOT=${BACKUP_ROOT}"
  case "${BACKUP_ROOT}" in
    "${EXTERNAL_STORAGE_ROOT}"/*) ;;
    *) fail "AQUILA_BACKUP_ROOT must be inside AQUILA_EXTERNAL_STORAGE_ROOT" ;;
  esac
  case "${BACKUP_ROOT}" in
    "${EXTERNAL_STORAGE_ROOT}/minio"|\
    "${EXTERNAL_STORAGE_ROOT}/minio"/*)
      fail "AQUILA_BACKUP_ROOT must not be inside the MinIO data directory"
      ;;
  esac
  if [[ "${AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT:-false}" != "true" && "${EXTERNAL_STORAGE_ROOT}" != "${DEFAULT_EXTERNAL_STORAGE_ROOT}" ]]; then
    fail "external storage root must be ${DEFAULT_EXTERNAL_STORAGE_ROOT}"
  fi
  if [[ "${AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK:-false}" != "true" ]]; then
    [[ -d "${EXTERNAL_STORAGE_ROOT}" ]] || fail "missing external storage root: ${EXTERNAL_STORAGE_ROOT}"
    is_mountpoint_path "${EXTERNAL_STORAGE_ROOT}" || fail "external storage root is not a mountpoint: ${EXTERNAL_STORAGE_ROOT}"
  fi
}

positive_integer() {
  local name="$1"
  local value="$2"
  [[ "${value}" =~ ^[0-9]+$ ]] || fail "${name} must be an integer"
}

check_free_space() {
  local min_free_percent="$1"
  positive_integer "AQUILA_BACKUP_MIN_FREE_PERCENT" "${min_free_percent}"
  if [[ "${min_free_percent}" -le 0 ]]; then
    return 0
  fi

  local df_line total available free_percent
  df_line="$(df -Pk "${BACKUP_ROOT}" | awk 'NR==2 { print $2 " " $4 }')"
  total="${df_line%% *}"
  available="${df_line##* }"
  if [[ -z "${total}" || -z "${available}" || "${total}" -le 0 ]]; then
    fail "could not read free space for ${BACKUP_ROOT}"
  fi
  free_percent=$((available * 100 / total))
  if [[ "${free_percent}" -lt "${min_free_percent}" ]]; then
    fail "free space ${free_percent}% is below required ${min_free_percent}%"
  fi
}

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is required for backup"
}

canonical_path_for_compare() {
  local path="$1"
  if [[ -e "${path}" ]]; then
    realpath "${path}"
    return
  fi
  local dir base
  dir="$(dirname "${path}")"
  base="$(basename "${path}")"
  [[ -d "${dir}" ]] || return 1
  printf '%s/%s\n' "$(realpath "${dir}")" "${base}"
}

assert_outside_backup_root() {
  local label="$1"
  local path="$2"
  local backup_root_for_exclusion path_for_exclusion
  backup_root_for_exclusion="$(canonical_path_for_compare "${BACKUP_ROOT}")" || fail "could not resolve AQUILA_BACKUP_ROOT=${BACKUP_ROOT}"
  path_for_exclusion="$(canonical_path_for_compare "${path}")" || fail "could not resolve ${label}=${path}"
  backup_root_for_exclusion="${backup_root_for_exclusion%/}"
  case "${path_for_exclusion}" in
    "${backup_root_for_exclusion}"|"${backup_root_for_exclusion}"/*)
      fail "${label} must be outside AQUILA_BACKUP_ROOT"
      ;;
  esac
}

validate_backup_encryption_key_file() {
  BACKUP_ENCRYPTION_KEY_FILE="$(env_value AQUILA_BACKUP_ENCRYPTION_KEY_FILE "${EXTERNAL_STORAGE_ROOT}/backup-encryption.key")"
  is_safe_absolute_path "${BACKUP_ENCRYPTION_KEY_FILE}" || fail "unsafe AQUILA_BACKUP_ENCRYPTION_KEY_FILE=${BACKUP_ENCRYPTION_KEY_FILE}"
  require_command realpath
  require_command openssl
  if [[ ! -e "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
    mkdir -p "$(dirname "${BACKUP_ENCRYPTION_KEY_FILE}")"
  fi
  assert_outside_backup_root "AQUILA_BACKUP_ENCRYPTION_KEY_FILE" "${BACKUP_ENCRYPTION_KEY_FILE}"
  if [[ ! -e "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
    (umask 077 && openssl rand -hex 32 > "${BACKUP_ENCRYPTION_KEY_FILE}") \
      || fail "failed to create backup encryption key file: ${BACKUP_ENCRYPTION_KEY_FILE}"
    log "created backup encryption key file: ${BACKUP_ENCRYPTION_KEY_FILE}"
  fi
  [[ -f "${BACKUP_ENCRYPTION_KEY_FILE}" ]] || fail "backup encryption key file is not a regular file: ${BACKUP_ENCRYPTION_KEY_FILE}"
  [[ -r "${BACKUP_ENCRYPTION_KEY_FILE}" ]] || fail "backup encryption key file is not readable: ${BACKUP_ENCRYPTION_KEY_FILE}"
  chmod 600 "${BACKUP_ENCRYPTION_KEY_FILE}" || fail "failed to harden backup encryption key file permissions: ${BACKUP_ENCRYPTION_KEY_FILE}"
  [[ -s "${BACKUP_ENCRYPTION_KEY_FILE}" ]] || fail "backup encryption key file is empty: ${BACKUP_ENCRYPTION_KEY_FILE}"
}

encrypt_stream_to_file() {
  local target_file="$1"
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:${BACKUP_ENCRYPTION_KEY_FILE}" -out "${target_file}"
}

compose() {
  docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

validate_compose_config_after_env_autofill() {
  compose config --quiet >/dev/null || fail "compose config validation failed after image env auto-fill"
}

ensure_backup_compose_ready() {
  if [[ "${COMPOSE_IMAGE_ENV_PREFLIGHT_DONE}" == "true" ]]; then
    return 0
  fi
  stage_home_server_env_compose_values
  ensure_compose_image_env_defaults
  validate_compose_config_after_env_autofill
  COMPOSE_IMAGE_ENV_PREFLIGHT_DONE="true"
}

prepare_postgres_backup_compose_if_needed() {
  if [[ "${AQUILA_BACKUP_SKIP_POSTGRES:-false}" == "true" ]]; then
    return 0
  fi

  command -v docker >/dev/null 2>&1 || fail "docker is required for PostgreSQL backup"
  ensure_backup_compose_ready
}

backup_classes() {
  printf '%s\n' daily

  local dow dom
  dow="$(date +%u 2>/dev/null || date +%w)"
  dom="$(date +%d)"
  if [[ "${AQUILA_BACKUP_FORCE_WEEKLY:-false}" == "true" || "${dow}" == "7" || "${dow}" == "0" ]]; then
    printf '%s\n' weekly
  fi
  if [[ "${AQUILA_BACKUP_FORCE_MONTHLY:-false}" == "true" || "${dom}" == "01" ]]; then
    printf '%s\n' monthly
  fi
}

write_metadata() {
  local class="$1"
  local target_dir="$2"
  local minio_mode="${3:-}"
  local image_key metadata_key image_value

  {
    echo "backup_set_id=${TIMESTAMP}"
    echo "manifest_version=2"
    echo "secret_files_copied=false"
    echo "class=${class}"
    echo "created_at=${TIMESTAMP}"
    echo "created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "git_head=$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo "external_storage_root=${EXTERNAL_STORAGE_ROOT}"
    echo "backup_root=${BACKUP_ROOT}"
    if [[ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]]; then
      echo "encryption=openssl-enc-aes-256-cbc-pbkdf2"
      echo "encryption_key_file=${BACKUP_ENCRYPTION_KEY_FILE}"
    fi
    if [[ -n "${POSTGRES_DB_NAME:-}" ]]; then
      echo "postgres_database=${POSTGRES_DB_NAME}"
    fi
    for image_key in "${COMPOSE_IMAGE_METADATA_KEYS[@]}"; do
      image_value="$(trim_quotes "$(read_key_from_file "${image_key}" "${COMPOSE_ENV_FILE}")")"
      if [[ -n "${image_value}" ]]; then
        require_digest_image_value "${image_key}" "${image_value}"
        echo "${image_key}=${image_value}"
      fi
    done
    for image_key in BACK_BLUE_IMAGE BACK_GREEN_IMAGE BACK_READ_IMAGE BACK_ADMIN_IMAGE BACK_WORKER_IMAGE; do
      metadata_key="$(metadata_backend_image_key "${image_key}")"
      image_value="$(trim_quotes "$(read_key_from_file "${image_key}" "${COMPOSE_ENV_FILE}")")"
      if [[ -n "${image_value}" ]]; then
        require_digest_image_value "${image_key}" "${image_value}"
        echo "${metadata_key}=${image_value}"
      fi
    done
    if [[ -n "${minio_mode}" ]]; then
      echo "minio_backup_mode=${minio_mode}"
    fi
  } > "${target_dir}/metadata.env"
}

copy_deploy_config() {
  local class="$1"
  local target_dir="${BACKUP_ROOT}/deploy/${class}/${TIMESTAMP}"
  mkdir -p "${target_dir}"

  if [[ -d "${SCRIPT_DIR}/caddy" ]]; then
    cp -R "${SCRIPT_DIR}/caddy" "${target_dir}/caddy"
  elif [[ -f "${SCRIPT_DIR}/Caddyfile" ]]; then
    mkdir -p "${target_dir}/caddy"
    cp "${SCRIPT_DIR}/Caddyfile" "${target_dir}/caddy/Caddyfile"
  fi

  local file
  for file in docker-compose.prod.yml .active_backend; do
    if [[ -f "${SCRIPT_DIR}/${file}" ]]; then
      cp "${SCRIPT_DIR}/${file}" "${target_dir}/${file}"
    fi
  done

  write_metadata "${class}" "${target_dir}"
}

backup_postgres() {
  local class="$1"
  local target_dir="${BACKUP_ROOT}/postgres/${class}/${TIMESTAMP}"
  mkdir -p "${target_dir}"

  if [[ "${AQUILA_BACKUP_SKIP_POSTGRES:-false}" == "true" ]]; then
    echo "skipped=true" > "${target_dir}/dump.sql.skipped"
    write_metadata "${class}" "${target_dir}"
    return 0
  fi

  prepare_postgres_backup_compose_if_needed
  compose exec -T db_1 pg_dump -U postgres -d "${POSTGRES_DB_NAME}" \
    | encrypt_stream_to_file "${target_dir}/dump.sql.enc"
  write_metadata "${class}" "${target_dir}"
}

is_dir_empty() {
  local dir="$1"
  [[ ! -d "${dir}" ]] && return 0
  [[ -z "$(find "${dir}" -mindepth 1 -maxdepth 1 -print -quit)" ]]
}

copy_docker_volume_to_dir() {
  local volume="$1"
  local target_dir="$2"
  local mountpoint=""

  mountpoint="$(docker volume inspect --format '{{ .Mountpoint }}' "${volume}" 2>/dev/null || true)"
  if [[ -n "${mountpoint}" && -r "${mountpoint}" ]]; then
    (cd "${mountpoint}" && tar cf - .) | (cd "${target_dir}" && tar xf -)
    return 0
  fi

  local copy_image="${AQUILA_DOCKER_COPY_IMAGE:-busybox:1.36.1}"
  docker run --rm \
    -v "${volume}:/from:ro" \
    -v "${target_dir}:/to" \
    "${copy_image}" \
    sh -c 'cd /from && tar cf - . | tar xf - -C /to'
}

stop_legacy_minio_for_migration() {
  local stop_timeout="${AQUILA_MINIO_MIGRATION_STOP_TIMEOUT_SECONDS:-60}"
  local cid

  while IFS= read -r cid; do
    [[ -n "${cid}" ]] || continue
    log "stopping legacy minio container before external storage migration: ${cid}"
    docker stop -t "${stop_timeout}" "${cid}" >/dev/null
    STOPPED_LEGACY_MINIO_CONTAINERS+=("${cid}")
  done < <(
    docker ps -q \
      --filter "label=com.docker.compose.project=blog_home" \
      --filter "label=com.docker.compose.service=minio_1"
  )
}

restart_stopped_legacy_minio_on_failure() {
  local cid
  for cid in "${STOPPED_LEGACY_MINIO_CONTAINERS[@]}"; do
    docker start "${cid}" >/dev/null 2>&1 || true
  done
  rm -f -- "${MIGRATION_STOPPED_FILE}"
}

stop_minio_for_consistent_backup() {
  local stop_timeout="${AQUILA_MINIO_BACKUP_STOP_TIMEOUT_SECONDS:-60}"
  local cid

  STOPPED_BACKUP_MINIO_CONTAINERS=()
  while IFS= read -r cid; do
    [[ -n "${cid}" ]] || continue
    log "stopping minio container for consistent filesystem backup: ${cid}"
    docker stop -t "${stop_timeout}" "${cid}" >/dev/null
    STOPPED_BACKUP_MINIO_CONTAINERS+=("${cid}")
  done < <(
    docker ps -q \
      --filter "label=com.docker.compose.project=blog_home" \
      --filter "label=com.docker.compose.service=minio_1"
  )

  if [[ "${#STOPPED_BACKUP_MINIO_CONTAINERS[@]}" -gt 0 ]]; then
    MINIO_STOPPED_FOR_BACKUP="true"
  fi
}

restart_minio_after_consistent_backup() {
  local cid
  local failed="false"

  for cid in "${STOPPED_BACKUP_MINIO_CONTAINERS[@]}"; do
    log "restarting minio container after filesystem backup: ${cid}"
    if ! docker start "${cid}" >/dev/null; then
      log "failed to restart minio container after backup: ${cid}"
      failed="true"
    fi
  done

  STOPPED_BACKUP_MINIO_CONTAINERS=()
  MINIO_STOPPED_FOR_BACKUP="false"
  [[ "${failed}" != "true" ]]
}

write_stopped_legacy_minio_marker() {
  local minio_dir="$1"
  if [[ "${#STOPPED_LEGACY_MINIO_CONTAINERS[@]}" -eq 0 ]]; then
    return 0
  fi
  {
    printf 'minio_dir=%s\n' "${minio_dir}"
    local cid
    for cid in "${STOPPED_LEGACY_MINIO_CONTAINERS[@]}"; do
      printf 'cid=%s\n' "${cid}"
    done
  } > "${MIGRATION_STOPPED_FILE}"
  LEGACY_MINIO_STOPPED_FOR_MIGRATION="true"
}

cleanup_on_exit() {
  local status=$?
  if [[ -n "${COMPOSE_ENV_FILE_TMP}" ]]; then
    rm -f -- "${COMPOSE_ENV_FILE_TMP}" "${COMPOSE_ENV_FILE_TMP}.tmp"
  fi
  if [[ "${status}" -ne 0 ]]; then
    if [[ "${MINIO_STOPPED_FOR_BACKUP}" == "true" ]]; then
      restart_minio_after_consistent_backup || true
    fi
    if [[ "${LEGACY_MINIO_STOPPED_FOR_MIGRATION}" == "true" ]]; then
      restart_stopped_legacy_minio_on_failure
      if [[ -n "${MIGRATED_MINIO_DIR_THIS_RUN}" && "${MIGRATED_MINIO_DIR_THIS_RUN}" != "/" && -d "${MIGRATED_MINIO_DIR_THIS_RUN}" ]]; then
        rm -rf -- "${MIGRATED_MINIO_DIR_THIS_RUN}"
      fi
    fi
  fi
  exit "${status}"
}

trap cleanup_on_exit EXIT

prepare_external_minio_dir() {
  local minio_dir="${EXTERNAL_STORAGE_ROOT}/minio"
  local legacy_volume="${AQUILA_LEGACY_MINIO_VOLUME:-blog_home_minio_data}"
  local tmp_dir="${EXTERNAL_STORAGE_ROOT}/.minio-migration-${TIMESTAMP}.tmp"

  mkdir -p "${minio_dir}"

  if ! is_dir_empty "${minio_dir}"; then
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if docker volume inspect "${legacy_volume}" >/dev/null 2>&1; then
    log "external minio directory is empty; copying legacy Docker volume ${legacy_volume}"
    rm -rf -- "${tmp_dir}"
    mkdir -p "${tmp_dir}"
    stop_legacy_minio_for_migration
    if ! copy_docker_volume_to_dir "${legacy_volume}" "${tmp_dir}"; then
      rm -rf -- "${tmp_dir}"
      restart_stopped_legacy_minio_on_failure
      fail "failed to copy legacy Docker volume ${legacy_volume}"
    fi
    if [[ -d "${minio_dir}" ]] && ! rmdir "${minio_dir}"; then
      rm -rf -- "${tmp_dir}"
      restart_stopped_legacy_minio_on_failure
      fail "external minio directory changed during migration: ${minio_dir}"
    fi
    if ! mv "${tmp_dir}" "${minio_dir}"; then
      rm -rf -- "${tmp_dir}"
      restart_stopped_legacy_minio_on_failure
      fail "failed to activate migrated MinIO directory: ${minio_dir}"
    fi
    MIGRATED_MINIO_DIR_THIS_RUN="${minio_dir}"
    write_stopped_legacy_minio_marker "${minio_dir}"
  fi
}

backup_minio() {
  local class="$1"
  local target_dir="${BACKUP_ROOT}/minio/${class}/${TIMESTAMP}"
  local minio_dir="${EXTERNAL_STORAGE_ROOT}/minio"
  local mode="offline-filesystem-copy"
  mkdir -p "${target_dir}"

  if [[ "${AQUILA_BACKUP_SKIP_MINIO:-false}" == "true" ]]; then
    echo "skipped=true" > "${target_dir}/minio.skipped"
    write_metadata "${class}" "${target_dir}" "skipped"
    return 0
  fi

  prepare_external_minio_dir
  [[ -d "${minio_dir}" ]] || fail "missing minio data directory: ${minio_dir}"

  stop_minio_for_consistent_backup
  if [[ "${#STOPPED_BACKUP_MINIO_CONTAINERS[@]}" -gt 0 ]]; then
    mode="stopped-filesystem-copy"
  fi
  if ! tar -C "${minio_dir}" -czf - . | encrypt_stream_to_file "${target_dir}/minio-data.tar.gz.enc"; then
    restart_minio_after_consistent_backup || true
    fail "failed to archive minio data directory: ${minio_dir}"
  fi
  restart_minio_after_consistent_backup || fail "failed to restart minio after backup"
  write_metadata "${class}" "${target_dir}" "${mode}"
}

EXTERNAL_STORAGE_ROOT="$(env_value AQUILA_EXTERNAL_STORAGE_ROOT "${DEFAULT_EXTERNAL_STORAGE_ROOT}")"
BACKUP_ROOT="$(env_value AQUILA_BACKUP_ROOT "${EXTERNAL_STORAGE_ROOT}/backups")"
MIN_FREE_PERCENT="$(env_value AQUILA_BACKUP_MIN_FREE_PERCENT "15")"
CURRENT_DB_BASE_NAME="$(env_value_from_current_file DB_BASE_NAME "blog")"
POSTGRES_DB_NAME="$(env_value_from_current_file CUSTOM_PROD_DBNAME "${CURRENT_DB_BASE_NAME}_prod")"

validate_paths
validate_backup_encryption_key_file
mkdir -p "${BACKUP_ROOT}/logs"
BACKUP_LOG_FILE="${BACKUP_ROOT}/logs/${TIMESTAMP}.log"
check_free_space "${MIN_FREE_PERCENT}"

classes=()
while IFS= read -r class; do
  [[ -n "${class}" ]] && classes+=("${class}")
done < <(backup_classes)

log "backup start id=${TIMESTAMP} root=${BACKUP_ROOT} classes=${classes[*]}"

for class in "${classes[@]}"; do
  prepare_postgres_backup_compose_if_needed
  copy_deploy_config "${class}"
  backup_postgres "${class}"
  backup_minio "${class}"
done

log "backup complete id=${TIMESTAMP}"
printf '%s\n' "${BACKUP_ROOT}/deploy/daily/${TIMESTAMP}"
