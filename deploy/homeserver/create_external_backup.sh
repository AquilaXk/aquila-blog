#!/usr/bin/env bash
set -euo pipefail

exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
DEFAULT_EXTERNAL_STORAGE_ROOT="/mnt/aquila-blog-data"
TIMESTAMP="${AQUILA_BACKUP_TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}"
BACKUP_LOG_FILE=""

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

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
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

  {
    echo "backup_set_id=${TIMESTAMP}"
    echo "class=${class}"
    echo "created_at=${TIMESTAMP}"
    echo "git_head=$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
    echo "external_storage_root=${EXTERNAL_STORAGE_ROOT}"
    echo "backup_root=${BACKUP_ROOT}"
    if [[ -n "${POSTGRES_DB_NAME:-}" ]]; then
      echo "postgres_database=${POSTGRES_DB_NAME}"
    fi
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
  for file in .env.prod docker-compose.prod.yml .active_backend; do
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

  command -v docker >/dev/null 2>&1 || fail "docker is required for PostgreSQL backup"
  compose exec -T db_1 pg_dump -U postgres -d "${POSTGRES_DB_NAME}" > "${target_dir}/dump.sql"
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

prepare_external_minio_dir() {
  local minio_dir="${EXTERNAL_STORAGE_ROOT}/minio"
  local legacy_volume="${AQUILA_LEGACY_MINIO_VOLUME:-blog_home_minio_data}"

  mkdir -p "${minio_dir}"

  if ! is_dir_empty "${minio_dir}"; then
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi

  if docker volume inspect "${legacy_volume}" >/dev/null 2>&1; then
    log "external minio directory is empty; copying legacy Docker volume ${legacy_volume}"
    copy_docker_volume_to_dir "${legacy_volume}" "${minio_dir}"
  fi
}

backup_minio() {
  local class="$1"
  local target_dir="${BACKUP_ROOT}/minio/${class}/${TIMESTAMP}"
  local minio_dir="${EXTERNAL_STORAGE_ROOT}/minio"
  local mode="filesystem-snapshot"
  mkdir -p "${target_dir}"

  if [[ "${AQUILA_BACKUP_SKIP_MINIO:-false}" == "true" ]]; then
    echo "skipped=true" > "${target_dir}/minio.skipped"
    write_metadata "${class}" "${target_dir}" "skipped"
    return 0
  fi

  prepare_external_minio_dir
  [[ -d "${minio_dir}" ]] || fail "missing minio data directory: ${minio_dir}"

  tar -C "${minio_dir}" -czf "${target_dir}/minio-data.tar.gz" .
  write_metadata "${class}" "${target_dir}" "${mode}"
}

EXTERNAL_STORAGE_ROOT="$(env_value AQUILA_EXTERNAL_STORAGE_ROOT "${DEFAULT_EXTERNAL_STORAGE_ROOT}")"
BACKUP_ROOT="$(env_value AQUILA_BACKUP_ROOT "${EXTERNAL_STORAGE_ROOT}/backups")"
MIN_FREE_PERCENT="$(env_value AQUILA_BACKUP_MIN_FREE_PERCENT "15")"
POSTGRES_DB_NAME="$(env_value CUSTOM_PROD_DBNAME "$(env_value DB_BASE_NAME "blog")_prod")"

validate_paths
mkdir -p "${BACKUP_ROOT}/logs"
BACKUP_LOG_FILE="${BACKUP_ROOT}/logs/${TIMESTAMP}.log"
check_free_space "${MIN_FREE_PERCENT}"

mapfile_available="true"
if ! command -v mapfile >/dev/null 2>&1; then
  mapfile_available="false"
fi

classes=()
while IFS= read -r class; do
  [[ -n "${class}" ]] && classes+=("${class}")
done < <(backup_classes)

log "backup start id=${TIMESTAMP} root=${BACKUP_ROOT} classes=${classes[*]}"

for class in "${classes[@]}"; do
  copy_deploy_config "${class}"
  backup_postgres "${class}"
  backup_minio "${class}"
done

log "backup complete id=${TIMESTAMP}"
printf '%s\n' "${BACKUP_ROOT}/deploy/daily/${TIMESTAMP}"
