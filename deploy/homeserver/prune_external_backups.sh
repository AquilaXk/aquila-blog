#!/usr/bin/env bash
set -euo pipefail

exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
DEFAULT_EXTERNAL_STORAGE_ROOT="/mnt/aquila-blog-data"

DRY_RUN="false"
for arg in "$@"; do
  case "${arg}" in
    --dry-run)
      DRY_RUN="true"
      ;;
    *)
      echo "usage: $0 [--dry-run]" >&2
      exit 2
      ;;
  esac
done

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

fail() {
  echo "[external-backup-prune] $*" >&2
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

retention_for_class() {
  case "$1" in
    daily) printf '%s' "${RETENTION_DAILY}" ;;
    weekly) printf '%s' "${RETENTION_WEEKLY}" ;;
    monthly) printf '%s' "${RETENTION_MONTHLY}" ;;
    *) fail "unknown backup class: $1" ;;
  esac
}

prune_class_dir() {
  local category="$1"
  local class="$2"
  local class_dir="${BACKUP_ROOT}/${category}/${class}"
  local keep_count
  keep_count="$(retention_for_class "${class}")"
  positive_integer "retention ${class}" "${keep_count}"

  [[ -d "${class_dir}" ]] || return 0

  local entries=()
  local candidate
  while IFS= read -r candidate; do
    local name
    name="$(basename "${candidate}")"
    if [[ "${name}" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
      entries+=("${candidate}")
    fi
  done < <(find "${class_dir}" -mindepth 1 -maxdepth 1 -type d -print | sort -r)

  [[ "${#entries[@]}" -gt 0 ]] || return 0

  local newest="${entries[0]}"
  local index=0
  for candidate in "${entries[@]}"; do
    index=$((index + 1))
    if [[ "${index}" -le "${keep_count}" || "${candidate}" == "${newest}" ]]; then
      continue
    fi

    if [[ "${DRY_RUN}" == "true" ]]; then
      echo "[external-backup-prune] dry-run delete ${candidate}"
    else
      echo "[external-backup-prune] delete ${candidate}"
      rm -rf -- "${candidate}"
    fi
  done
}

EXTERNAL_STORAGE_ROOT="$(env_value AQUILA_EXTERNAL_STORAGE_ROOT "${DEFAULT_EXTERNAL_STORAGE_ROOT}")"
BACKUP_ROOT="$(env_value AQUILA_BACKUP_ROOT "${EXTERNAL_STORAGE_ROOT}/backups")"
RETENTION_DAILY="$(env_value AQUILA_BACKUP_RETENTION_DAILY "14")"
RETENTION_WEEKLY="$(env_value AQUILA_BACKUP_RETENTION_WEEKLY "8")"
RETENTION_MONTHLY="$(env_value AQUILA_BACKUP_RETENTION_MONTHLY "6")"
MIN_FREE_PERCENT="$(env_value AQUILA_BACKUP_MIN_FREE_PERCENT "15")"

validate_paths
mkdir -p "${BACKUP_ROOT}"

for category in postgres minio deploy; do
  for class in daily weekly monthly; do
    prune_class_dir "${category}" "${class}"
  done
done

check_free_space "${MIN_FREE_PERCENT}"
echo "[external-backup-prune] ok root=${BACKUP_ROOT} dry_run=${DRY_RUN}"
