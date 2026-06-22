#!/usr/bin/env bash
set -euo pipefail

exec </dev/null

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_EXTERNAL_STORAGE_ROOT="/mnt/aquila-blog-data"
TIMESTAMP="${AQUILA_RESTORE_DRILL_TIMESTAMP:-$(date -u +%Y%m%d-%H%M%S)}"
BACKUP_CLASS="${AQUILA_RESTORE_DRILL_CLASS:-${BACKUP_CLASS:-daily}}"
BACKUP_SET_ID="${AQUILA_RESTORE_DRILL_BACKUP_SET_ID:-${BACKUP_SET_ID:-}}"
EXTERNAL_STORAGE_ROOT="${AQUILA_EXTERNAL_STORAGE_ROOT:-${DEFAULT_EXTERNAL_STORAGE_ROOT}}"
BACKUP_ROOT="${AQUILA_BACKUP_ROOT:-${EXTERNAL_STORAGE_ROOT}/backups}"
ARTIFACT_DIR="${AQUILA_RESTORE_DRILL_ARTIFACT_DIR:-${SCRIPT_DIR}/.restore-drills/${TIMESTAMP}}"
if [[ -n "${AQUILA_RESTORE_DRILL_DEPLOY_DIR:-}" ]]; then
  DEPLOY_DIR="${AQUILA_RESTORE_DRILL_DEPLOY_DIR}"
elif [[ -d "$(pwd)/deploy/homeserver" ]]; then
  DEPLOY_DIR="$(pwd)/deploy/homeserver"
elif [[ -f "$(pwd)/.env.prod" || -f "$(pwd)/docker-compose.prod.yml" ]]; then
  DEPLOY_DIR="$(pwd)"
else
  DEPLOY_DIR="${SCRIPT_DIR}"
fi
POSTGRES_CONTAINER="aquila-restore-drill-${TIMESTAMP}"
POSTGRES_DB="${AQUILA_RESTORE_DRILL_DB:-restore_drill}"
POSTGRES_PASSWORD="${AQUILA_RESTORE_DRILL_POSTGRES_PASSWORD:-restore_drill_${TIMESTAMP}}"
RPO_TARGET_MINUTES="${AQUILA_RESTORE_DRILL_RPO_TARGET_MINUTES:-1440}"
RTO_TARGET_MINUTES="${AQUILA_RESTORE_DRILL_RTO_TARGET_MINUTES:-120}"
SUMMARY_FILE="${ARTIFACT_DIR}/restore-drill-summary.md"
RESULT_FILE="${ARTIFACT_DIR}/restore-drill-result.env"
CHECKSUM_FILE="${ARTIFACT_DIR}/minio-checksums.sha256"
RESTORE_PRIVACY_GATE_FILE="${ARTIFACT_DIR}/restore-privacy-gate.txt"
BACKUP_ENCRYPTION_KEY_FILE="${AQUILA_BACKUP_ENCRYPTION_KEY_FILE:-}"
RESTORE_PRIVACY_GATE_SCRIPT="${AQUILA_RESTORE_PRIVACY_GATE_SCRIPT:-}"
RESTORE_PRIVACY_GATE_STATUS="fail"
DECRYPT_BASE_DIR=""
DECRYPT_DIR=""

log() {
  printf '[restore-drill] %s\n' "$*" >&2
}

fail() {
  log "$*"
  exit 1
}

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is required for restore drill"
}

is_safe_backup_id() {
  [[ "$1" =~ ^[0-9]{8}-[0-9]{6}$ ]]
}

read_key_from_file() {
  local key="$1"
  local file="$2"
  [[ -f "${file}" ]] || return 0
  awk -F= -v k="${key}" '
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
  ' "${file}" | tail -n 1
}

resolve_postgres_image() {
  local image="${AQUILA_RESTORE_DRILL_POSTGRES_IMAGE:-${DB_IMAGE:-}}"
  if [[ -z "${image}" ]]; then
    image="$(read_key_from_file DB_IMAGE "${DEPLOY_DIR}/.env.prod.compose")"
  fi
  if [[ -z "${image}" ]]; then
    image="$(read_key_from_file DB_IMAGE "${DEPLOY_DIR}/.env.prod")"
  fi

  [[ -n "${image}" ]] || fail "DB_IMAGE is required for restore drill PostgreSQL image"
  [[ "${image}" != *":latest" && "${image}" != *":latest@"* ]] || fail "DB_IMAGE must not use latest tag for restore drill: ${image}"
  printf '%s' "${image}"
}

resolve_storage_paths() {
  local external_root="${AQUILA_EXTERNAL_STORAGE_ROOT:-}"
  local backup_root="${AQUILA_BACKUP_ROOT:-}"

  if [[ -z "${external_root}" ]]; then
    external_root="$(read_key_from_file AQUILA_EXTERNAL_STORAGE_ROOT "${DEPLOY_DIR}/.env.prod.compose")"
  fi
  if [[ -z "${external_root}" ]]; then
    external_root="$(read_key_from_file AQUILA_EXTERNAL_STORAGE_ROOT "${DEPLOY_DIR}/.env.prod")"
  fi
  EXTERNAL_STORAGE_ROOT="${external_root:-${DEFAULT_EXTERNAL_STORAGE_ROOT}}"

  if [[ -z "${backup_root}" ]]; then
    backup_root="$(read_key_from_file AQUILA_BACKUP_ROOT "${DEPLOY_DIR}/.env.prod.compose")"
  fi
  if [[ -z "${backup_root}" ]]; then
    backup_root="$(read_key_from_file AQUILA_BACKUP_ROOT "${DEPLOY_DIR}/.env.prod")"
  fi
  BACKUP_ROOT="${backup_root:-${EXTERNAL_STORAGE_ROOT}/backups}"
}

latest_backup_set_id() {
  local postgres_root="${BACKUP_ROOT}/postgres/${BACKUP_CLASS}"
  [[ -d "${postgres_root}" ]] || fail "missing PostgreSQL backup class directory: ${postgres_root}"
  find "${postgres_root}" -mindepth 1 -maxdepth 1 -type d -print \
    | sed 's#.*/##' \
    | sort \
    | tail -n 1
}

date_utc_epoch() {
  local value="$1"
  date -u -d "${value}" +%s 2>/dev/null \
    || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "${value}" +%s 2>/dev/null \
    || true
}

date_local_epoch_from_backup_id() {
  local backup_id="$1"
  local stamp="${backup_id:0:8} ${backup_id:9:2}:${backup_id:11:2}:${backup_id:13:2}"
  date -d "${stamp}" +%s 2>/dev/null \
    || date -j -f "%Y%m%d-%H%M%S" "${backup_id}" +%s 2>/dev/null \
    || true
}

parse_backup_epoch() {
  local backup_id="$1"
  local metadata_file="${BACKUP_ROOT}/postgres/${BACKUP_CLASS}/${backup_id}/metadata.env"
  local created_at_utc

  created_at_utc="$(read_key_from_file created_at_utc "${metadata_file}")"
  if [[ -n "${created_at_utc}" ]]; then
    date_utc_epoch "${created_at_utc}"
    return 0
  fi

  date_local_epoch_from_backup_id "${backup_id}"
}

is_safe_absolute_path() {
  local value="$1"
  [[ "${value}" == /* ]] || return 1
  [[ "${value}" != "/" ]] || return 1
  [[ "${value}" != *"//"* ]] || return 1
  [[ ! "${value}" =~ (^|/)\.\.?($|/) ]] || return 1
}

resolve_restore_privacy_contract() {
  if [[ -z "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
    BACKUP_ENCRYPTION_KEY_FILE="$(read_key_from_file AQUILA_BACKUP_ENCRYPTION_KEY_FILE "${DEPLOY_DIR}/.env.prod.compose")"
  fi
  if [[ -z "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
    BACKUP_ENCRYPTION_KEY_FILE="$(read_key_from_file AQUILA_BACKUP_ENCRYPTION_KEY_FILE "${DEPLOY_DIR}/.env.prod")"
  fi
  if [[ -z "${BACKUP_ENCRYPTION_KEY_FILE}" ]]; then
    BACKUP_ENCRYPTION_KEY_FILE="${EXTERNAL_STORAGE_ROOT}/backup-encryption.key"
  fi
  if [[ -z "${RESTORE_PRIVACY_GATE_SCRIPT}" ]]; then
    RESTORE_PRIVACY_GATE_SCRIPT="$(read_key_from_file AQUILA_RESTORE_PRIVACY_GATE_SCRIPT "${DEPLOY_DIR}/.env.prod.compose")"
  fi
  if [[ -z "${RESTORE_PRIVACY_GATE_SCRIPT}" ]]; then
    RESTORE_PRIVACY_GATE_SCRIPT="$(read_key_from_file AQUILA_RESTORE_PRIVACY_GATE_SCRIPT "${DEPLOY_DIR}/.env.prod")"
  fi

  [[ -n "${RESTORE_PRIVACY_GATE_SCRIPT}" ]] || fail "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT is required before traffic open"
  is_safe_absolute_path "${RESTORE_PRIVACY_GATE_SCRIPT}" || fail "unsafe AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=${RESTORE_PRIVACY_GATE_SCRIPT}"
  local backup_root_for_exclusion="${BACKUP_ROOT%/}"
  case "${RESTORE_PRIVACY_GATE_SCRIPT}" in
    "${backup_root_for_exclusion}"|"${backup_root_for_exclusion}"/*)
      fail "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT must be outside AQUILA_BACKUP_ROOT"
      ;;
  esac
  [[ -x "${RESTORE_PRIVACY_GATE_SCRIPT}" ]] || fail "restore privacy gate script is not executable: ${RESTORE_PRIVACY_GATE_SCRIPT}"
}

validate_backup_encryption_key_file() {
  local backup_root_for_exclusion="${BACKUP_ROOT%/}"
  is_safe_absolute_path "${BACKUP_ENCRYPTION_KEY_FILE}" || fail "unsafe AQUILA_BACKUP_ENCRYPTION_KEY_FILE=${BACKUP_ENCRYPTION_KEY_FILE}"
  case "${BACKUP_ENCRYPTION_KEY_FILE}" in
    "${backup_root_for_exclusion}"|"${backup_root_for_exclusion}"/*)
      fail "AQUILA_BACKUP_ENCRYPTION_KEY_FILE must be outside AQUILA_BACKUP_ROOT"
      ;;
  esac
  [[ -f "${BACKUP_ENCRYPTION_KEY_FILE}" ]] || fail "backup encryption key file is not a regular file: ${BACKUP_ENCRYPTION_KEY_FILE}"
  [[ -r "${BACKUP_ENCRYPTION_KEY_FILE}" ]] || fail "backup encryption key file is not readable: ${BACKUP_ENCRYPTION_KEY_FILE}"
}

resolve_backup_encryption_key_for_backup() {
  local metadata_file="${BACKUP_ROOT}/postgres/${BACKUP_CLASS}/${BACKUP_SET_ID}/metadata.env"
  local metadata_key_file

  metadata_key_file="$(read_key_from_file encryption_key_file "${metadata_file}")"
  if [[ -n "${metadata_key_file}" ]]; then
    BACKUP_ENCRYPTION_KEY_FILE="${metadata_key_file}"
  fi
  validate_backup_encryption_key_file
}

decrypt_file_to_path() {
  local source_file="$1"
  local target_file="$2"
  openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:${BACKUP_ENCRYPTION_KEY_FILE}" -in "${source_file}" -out "${target_file}"
}

file_size_bytes() {
  local file="$1"
  stat -c %s "${file}" 2>/dev/null || stat -f %z "${file}"
}

available_bytes_for_path() {
  local path="$1"
  df -Pk "${path}" | awk 'NR == 2 { printf "%.0f\n", $4 * 1024 }'
}

prepare_decrypt_workspace() {
  local postgres_size
  local minio_size
  local required_bytes
  local available_bytes

  DECRYPT_BASE_DIR="${AQUILA_RESTORE_DRILL_DECRYPT_DIR:-${BACKUP_ROOT}/.restore-drill-decrypted}"
  is_safe_absolute_path "${DECRYPT_BASE_DIR}" || fail "unsafe AQUILA_RESTORE_DRILL_DECRYPT_DIR=${DECRYPT_BASE_DIR}"
  mkdir -p "${DECRYPT_BASE_DIR}"

  postgres_size="$(file_size_bytes "${POSTGRES_ENCRYPTED_DUMP_FILE}")"
  minio_size="$(file_size_bytes "${MINIO_ENCRYPTED_ARCHIVE_FILE}")"
  required_bytes=$((postgres_size + minio_size))
  available_bytes="$(available_bytes_for_path "${DECRYPT_BASE_DIR}")"
  [[ -n "${available_bytes}" ]] || fail "could not determine restore decrypt workspace free space: ${DECRYPT_BASE_DIR}"
  (( available_bytes > required_bytes )) \
    || fail "insufficient restore decrypt workspace free space: required=${required_bytes} available=${available_bytes} dir=${DECRYPT_BASE_DIR}"

  DECRYPT_DIR="$(mktemp -d "${DECRYPT_BASE_DIR%/}/aquila-restore-drill-decrypted.${TIMESTAMP}.XXXXXX")"
}

write_result() {
  local status="$1"
  local rto_seconds="$2"
  local rpo_minutes="$3"
  local flyway_success_count="$4"
  local post_count="$5"
  local latest_public_post_id="$6"
  local minio_sample_object="$7"
  local minio_sample_sha256="$8"

  {
    printf 'STATUS=%s\n' "${status}"
    printf 'BACKUP_SET_ID=%s\n' "${BACKUP_SET_ID}"
    printf 'BACKUP_CLASS=%s\n' "${BACKUP_CLASS}"
    printf 'POSTGRES_IMAGE=%q\n' "${POSTGRES_IMAGE}"
    printf 'RPO_TARGET_MINUTES=%s\n' "${RPO_TARGET_MINUTES}"
    printf 'RPO_ACTUAL_MINUTES=%s\n' "${rpo_minutes}"
    printf 'RTO_TARGET_MINUTES=%s\n' "${RTO_TARGET_MINUTES}"
    printf 'RTO_ACTUAL_SECONDS=%s\n' "${rto_seconds}"
    printf 'FLYWAY_SUCCESS_COUNT=%s\n' "${flyway_success_count}"
    printf 'POST_ROW_COUNT=%s\n' "${post_count}"
    printf 'LATEST_PUBLIC_POST_ID=%s\n' "${latest_public_post_id}"
    printf 'MINIO_SAMPLE_OBJECT=%q\n' "${minio_sample_object}"
    printf 'MINIO_SAMPLE_SHA256=%s\n' "${minio_sample_sha256}"
    printf 'ENCRYPTION=%s\n' "openssl-enc-aes-256-cbc-pbkdf2"
    printf 'RESTORE_PRIVACY_GATE=%s\n' "${RESTORE_PRIVACY_GATE_STATUS}"
    printf 'RESTORE_PRIVACY_GATE_FILE=%q\n' "${RESTORE_PRIVACY_GATE_FILE}"
    printf 'SUMMARY_FILE=%q\n' "${SUMMARY_FILE}"
  } > "${RESULT_FILE}"
}

write_summary() {
  local status="$1"
  local rto_seconds="$2"
  local rpo_minutes="$3"
  local flyway_success_count="$4"
  local post_count="$5"
  local latest_public_post_id="$6"
  local minio_sample_object="$7"
  local minio_sample_sha256="$8"

  {
    printf '# Backup Restore Drill Summary\n\n'
    printf -- '- Status: `%s`\n' "${status}"
    printf -- '- Backup set: `%s/%s`\n' "${BACKUP_CLASS}" "${BACKUP_SET_ID}"
    printf -- '- PostgreSQL dump: `%s`\n' "${POSTGRES_DUMP_FILE}"
    printf -- '- MinIO archive: `%s`\n' "${MINIO_ARCHIVE_FILE}"
    printf -- '- RPO target: `%s minutes`\n' "${RPO_TARGET_MINUTES}"
    printf -- '- RPO actual: `%s minutes`\n' "${rpo_minutes}"
    printf -- '- RTO target: `%s minutes`\n' "${RTO_TARGET_MINUTES}"
    printf -- '- RTO actual: `%s seconds`\n' "${rto_seconds}"
    printf -- '- Flyway successful migrations: `%s`\n' "${flyway_success_count}"
    printf -- '- Restored post rows: `%s`\n' "${post_count}"
    printf -- '- Latest public post id: `%s`\n' "${latest_public_post_id}"
    printf -- '- MinIO checksum sample: `%s`\n' "${minio_sample_object}"
    printf -- '- MinIO sample sha256: `%s`\n' "${minio_sample_sha256}"
    printf -- '- Backup encryption: `openssl-enc-aes-256-cbc-pbkdf2`\n'
    printf -- '- Restore privacy gate: `%s`\n' "${RESTORE_PRIVACY_GATE_STATUS}"
  } > "${SUMMARY_FILE}"
}

cleanup() {
  docker rm -f -v "${POSTGRES_CONTAINER}" >/dev/null 2>&1 || true
  if [[ -n "${DECRYPT_DIR}" && -n "${DECRYPT_BASE_DIR}" && "${DECRYPT_DIR}" == "${DECRYPT_BASE_DIR%/}"/aquila-restore-drill-decrypted.* && -d "${DECRYPT_DIR}" ]]; then
    rm -rf -- "${DECRYPT_DIR}"
  fi
}

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 60); do
    if docker exec "${POSTGRES_CONTAINER}" pg_isready -U postgres -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail "temporary PostgreSQL did not become ready"
}

psql_restore() {
  docker exec -i "${POSTGRES_CONTAINER}" psql -U postgres -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${POSTGRES_DUMP_FILE}" >/dev/null
}

psql_scalar() {
  local sql="$1"
  docker exec "${POSTGRES_CONTAINER}" \
    psql -U postgres -d "${POSTGRES_DB}" -At -v ON_ERROR_STOP=1 -c "${sql}" \
    | tr -d '\r' \
    | head -n 1
}

select_minio_sample_object() {
  tar -tzf "${MINIO_ARCHIVE_FILE}" \
    | sed 's#^\./##' \
    | grep -Ev '(^$|/$|(^|/)format\.json$|(^|/)\.minio\.sys/)' \
    | sort \
    | awk 'NR == 1 { first = $0 } END { if (first != "") print first }'
}

checksum_minio_sample() {
  local object_key="$1"
  local tar_path="${object_key}"
  if ! tar -tzf "${MINIO_ARCHIVE_FILE}" "${tar_path}" >/dev/null 2>&1; then
    tar_path="./${object_key}"
  fi
  tar -xOzf "${MINIO_ARCHIVE_FILE}" "${tar_path}" | sha256sum | awk '{print $1}'
}

run_restore_privacy_gate() {
  BACKUP_SET_ID="${BACKUP_SET_ID}" \
    BACKUP_CLASS="${BACKUP_CLASS}" \
    POSTGRES_CONTAINER="${POSTGRES_CONTAINER}" \
    POSTGRES_DB="${POSTGRES_DB}" \
    MINIO_CHECKSUM_FILE="${CHECKSUM_FILE}" \
    MINIO_SAMPLE_OBJECT="${minio_sample_object}" \
    RESTORE_PRIVACY_GATE_FILE="${RESTORE_PRIVACY_GATE_FILE}" \
    "${RESTORE_PRIVACY_GATE_SCRIPT}" > "${RESTORE_PRIVACY_GATE_FILE}"
  [[ -s "${RESTORE_PRIVACY_GATE_FILE}" ]] || fail "restore privacy gate produced no evidence: ${RESTORE_PRIVACY_GATE_FILE}"
  grep -Eq '^status=pass$' "${RESTORE_PRIVACY_GATE_FILE}" \
    || fail "restore privacy gate did not report status=pass: ${RESTORE_PRIVACY_GATE_FILE}"
  RESTORE_PRIVACY_GATE_STATUS="pass"
}

require_command docker
require_command tar
require_command sha256sum
require_command openssl
resolve_storage_paths
resolve_restore_privacy_contract
POSTGRES_IMAGE="$(resolve_postgres_image)"

if [[ -z "${BACKUP_SET_ID}" ]]; then
  BACKUP_SET_ID="$(latest_backup_set_id)"
fi
is_safe_backup_id "${BACKUP_SET_ID}" || fail "unsafe backup set id: ${BACKUP_SET_ID}"
resolve_backup_encryption_key_for_backup

POSTGRES_ENCRYPTED_DUMP_FILE="${BACKUP_ROOT}/postgres/${BACKUP_CLASS}/${BACKUP_SET_ID}/dump.sql.enc"
MINIO_ENCRYPTED_ARCHIVE_FILE="${BACKUP_ROOT}/minio/${BACKUP_CLASS}/${BACKUP_SET_ID}/minio-data.tar.gz.enc"

[[ -s "${POSTGRES_ENCRYPTED_DUMP_FILE}" ]] || fail "missing encrypted PostgreSQL dump.sql.enc: ${POSTGRES_ENCRYPTED_DUMP_FILE}"
[[ -s "${MINIO_ENCRYPTED_ARCHIVE_FILE}" ]] || fail "missing encrypted MinIO minio-data.tar.gz.enc: ${MINIO_ENCRYPTED_ARCHIVE_FILE}"

mkdir -p "${ARTIFACT_DIR}"
trap cleanup EXIT
prepare_decrypt_workspace
POSTGRES_DUMP_FILE="${DECRYPT_DIR}/dump.sql"
MINIO_ARCHIVE_FILE="${DECRYPT_DIR}/minio-data.tar.gz"
decrypt_file_to_path "${POSTGRES_ENCRYPTED_DUMP_FILE}" "${POSTGRES_DUMP_FILE}"
decrypt_file_to_path "${MINIO_ENCRYPTED_ARCHIVE_FILE}" "${MINIO_ARCHIVE_FILE}"

start_epoch="${AQUILA_RESTORE_DRILL_NOW_EPOCH:-$(date -u +%s)}"
backup_epoch="$(parse_backup_epoch "${BACKUP_SET_ID}")"
if [[ -n "${backup_epoch}" ]]; then
  rpo_minutes=$(((start_epoch - backup_epoch) / 60))
else
  rpo_minutes="unknown"
fi

log "starting restore drill backup=${BACKUP_CLASS}/${BACKUP_SET_ID} artifact_dir=${ARTIFACT_DIR}"
docker run -d \
  --name "${POSTGRES_CONTAINER}" \
  -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
  -e "POSTGRES_DB=${POSTGRES_DB}" \
  "${POSTGRES_IMAGE}" >/dev/null
wait_for_postgres

psql_restore

flyway_success_count="$(psql_scalar "SELECT COUNT(*) FROM flyway_schema_history WHERE success = true;")"
post_count="$(psql_scalar "SELECT COUNT(*) FROM post;")"
latest_public_post_id="$(psql_scalar "SELECT id FROM post WHERE listed = true ORDER BY created_at DESC, id DESC LIMIT 1;")"
[[ -n "${latest_public_post_id}" ]] || fail "latest public post query returned no rows"

minio_sample_object="$(select_minio_sample_object)"
[[ -n "${minio_sample_object}" ]] || fail "MinIO backup archive has no checksumable object sample"
minio_sample_sha256="$(checksum_minio_sample "${minio_sample_object}")"
printf '%s  %s\n' "${minio_sample_sha256}" "${minio_sample_object}" > "${CHECKSUM_FILE}"
run_restore_privacy_gate

end_epoch="$(date -u +%s)"
rto_seconds=$((end_epoch - start_epoch))
status="success"
write_result "${status}" "${rto_seconds}" "${rpo_minutes}" "${flyway_success_count}" "${post_count}" "${latest_public_post_id}" "${minio_sample_object}" "${minio_sample_sha256}"
write_summary "${status}" "${rto_seconds}" "${rpo_minutes}" "${flyway_success_count}" "${post_count}" "${latest_public_post_id}" "${minio_sample_object}" "${minio_sample_sha256}"

log "restore drill complete status=${status} summary=${SUMMARY_FILE}"
printf '%s\n' "${ARTIFACT_DIR}"
