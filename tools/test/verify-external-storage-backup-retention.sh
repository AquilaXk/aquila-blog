#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CREATE_SCRIPT="${ROOT_DIR}/deploy/homeserver/create_external_backup.sh"
PRUNE_SCRIPT="${ROOT_DIR}/deploy/homeserver/prune_external_backups.sh"

if [[ ! -x "${CREATE_SCRIPT}" ]]; then
  echo "missing executable create script: ${CREATE_SCRIPT}" >&2
  exit 1
fi
if [[ ! -x "${PRUNE_SCRIPT}" ]]; then
  echo "missing executable prune script: ${PRUNE_SCRIPT}" >&2
  exit 1
fi

TMP_BASE="${TMPDIR:-/tmp}"
TMP_BASE="${TMP_BASE%/}"
WORK_DIR="$(mktemp -d "${TMP_BASE}/aquila-external-backup-retention.XXXXXX")"
trap 'rm -rf "${WORK_DIR}"' EXIT

BACKUP_ROOT="${WORK_DIR}/backups"

make_backups() {
  local category="$1"
  local class="$2"
  local count="$3"
  local pattern="$4"
  local dir

  for index in $(seq 1 "${count}"); do
    case "${pattern}" in
      "202601%02d-000000")
        printf -v dir '202601%02d-000000' "${index}"
        ;;
      "202602%02d-000000")
        printf -v dir '202602%02d-000000' "${index}"
        ;;
      "2026%02d01-000000")
        printf -v dir '2026%02d01-000000' "${index}"
        ;;
      *)
        echo "unsupported backup fixture pattern: ${pattern}" >&2
        exit 1
        ;;
    esac
    mkdir -p "${BACKUP_ROOT}/${category}/${class}/${dir}"
    printf '%s\n' "${category}/${class}/${dir}" > "${BACKUP_ROOT}/${category}/${class}/${dir}/metadata.env"
  done
}

make_backups postgres daily 20 "202601%02d-000000"
make_backups postgres weekly 12 "202602%02d-000000"
make_backups postgres monthly 9 "2026%02d01-000000"
make_backups minio daily 20 "202601%02d-000000"
make_backups deploy daily 20 "202601%02d-000000"

DRY_RUN_LOG="${WORK_DIR}/dry-run.log"
AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
AQUILA_EXTERNAL_STORAGE_ROOT="${WORK_DIR}" \
AQUILA_BACKUP_ROOT="${BACKUP_ROOT}" \
AQUILA_BACKUP_RETENTION_DAILY=14 \
AQUILA_BACKUP_RETENTION_WEEKLY=8 \
AQUILA_BACKUP_RETENTION_MONTHLY=6 \
AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
  "${PRUNE_SCRIPT}" --dry-run > "${DRY_RUN_LOG}"

if [[ ! -d "${BACKUP_ROOT}/postgres/daily/20260101-000000" ]]; then
  echo "dry-run deleted an old daily backup" >&2
  exit 1
fi

grep -q "dry-run.*postgres/daily/20260101-000000" "${DRY_RUN_LOG}"
grep -q "dry-run.*postgres/weekly/20260201-000000" "${DRY_RUN_LOG}"
grep -q "dry-run.*postgres/monthly/20260101-000000" "${DRY_RUN_LOG}"

AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
AQUILA_EXTERNAL_STORAGE_ROOT="${WORK_DIR}" \
AQUILA_BACKUP_ROOT="${BACKUP_ROOT}" \
AQUILA_BACKUP_RETENTION_DAILY=14 \
AQUILA_BACKUP_RETENTION_WEEKLY=8 \
AQUILA_BACKUP_RETENTION_MONTHLY=6 \
AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
  "${PRUNE_SCRIPT}"

count_dirs() {
  find "$1" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' '
}

[[ "$(count_dirs "${BACKUP_ROOT}/postgres/daily")" == "14" ]]
[[ "$(count_dirs "${BACKUP_ROOT}/postgres/weekly")" == "8" ]]
[[ "$(count_dirs "${BACKUP_ROOT}/postgres/monthly")" == "6" ]]
[[ "$(count_dirs "${BACKUP_ROOT}/minio/daily")" == "14" ]]
[[ "$(count_dirs "${BACKUP_ROOT}/deploy/daily")" == "14" ]]

[[ -d "${BACKUP_ROOT}/postgres/daily/20260120-000000" ]]
[[ -d "${BACKUP_ROOT}/postgres/weekly/20260212-000000" ]]
[[ -d "${BACKUP_ROOT}/postgres/monthly/20260901-000000" ]]
[[ ! -d "${BACKUP_ROOT}/postgres/daily/20260101-000000" ]]

LOW_SPACE_ROOT="${WORK_DIR}/low-space-root"
LOW_SPACE_BACKUP_ROOT="${LOW_SPACE_ROOT}/backups"
for dir in 20260101-000000 20260102-000000 20260103-000000; do
  mkdir -p "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/${dir}"
  printf 'postgres/daily/%s\n' "${dir}" > "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/${dir}/metadata.env"
done

AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${LOW_SPACE_ROOT}" \
  AQUILA_BACKUP_ROOT="${LOW_SPACE_BACKUP_ROOT}" \
  AQUILA_BACKUP_RETENTION_DAILY=1 \
  AQUILA_BACKUP_RETENTION_WEEKLY=1 \
  AQUILA_BACKUP_RETENTION_MONTHLY=1 \
  AQUILA_BACKUP_MIN_FREE_PERCENT=100 \
    "${PRUNE_SCRIPT}" --dry-run >/dev/null

[[ -d "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/20260101-000000" ]]
[[ -d "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/20260102-000000" ]]
[[ -d "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/20260103-000000" ]]

if AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${LOW_SPACE_ROOT}" \
  AQUILA_BACKUP_ROOT="${LOW_SPACE_BACKUP_ROOT}" \
  AQUILA_BACKUP_RETENTION_DAILY=1 \
  AQUILA_BACKUP_RETENTION_WEEKLY=1 \
  AQUILA_BACKUP_RETENTION_MONTHLY=1 \
  AQUILA_BACKUP_MIN_FREE_PERCENT=100 \
    "${PRUNE_SCRIPT}" >/dev/null 2>&1; then
  echo "prune unexpectedly passed the post-prune low-space guard" >&2
  exit 1
fi

[[ ! -d "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/20260101-000000" ]]
[[ ! -d "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/20260102-000000" ]]
[[ -d "${LOW_SPACE_BACKUP_ROOT}/postgres/daily/20260103-000000" ]]

DAILY_DEDUP_ROOT="${WORK_DIR}/daily-dedup-root"
DAILY_DEDUP_BACKUP_ROOT="${DAILY_DEDUP_ROOT}/backups"
for dir in \
  20260117-120000 \
  20260118-120000 \
  20260119-120000 \
  20260120-010000 \
  20260120-020000 \
  20260120-030000; do
  mkdir -p "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/${dir}"
  printf 'postgres/daily/%s\n' "${dir}" > "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/${dir}/metadata.env"
done
mkdir -p "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-010000"
mkdir -p "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-020000"
printf 'partial-ciphertext' > "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-020000/dump.sql.enc"
mkdir -p "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-030000"
printf 'postgres_database=blog_prod\n' > "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-030000/metadata.env"

AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${DAILY_DEDUP_ROOT}" \
  AQUILA_BACKUP_ROOT="${DAILY_DEDUP_BACKUP_ROOT}" \
  AQUILA_BACKUP_RETENTION_DAILY=3 \
  AQUILA_BACKUP_RETENTION_WEEKLY=1 \
  AQUILA_BACKUP_RETENTION_MONTHLY=1 \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
    "${PRUNE_SCRIPT}" >/dev/null

[[ ! -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-010000" ]] || { echo "incomplete empty backup dir was not pruned" >&2; exit 1; }
[[ ! -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-020000" ]] || { echo "incomplete partial backup dir was not pruned" >&2; exit 1; }
[[ ! -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260121-030000" ]] || { echo "metadata-only backup dir missing dump.sql.enc was not pruned" >&2; exit 1; }
[[ -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260120-030000" ]] || { echo "newest backup of 20260120 was not retained" >&2; exit 1; }
[[ ! -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260120-020000" ]] || { echo "older same-day backup 20260120-020000 was not deduplicated" >&2; exit 1; }
[[ ! -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260120-010000" ]] || { echo "older same-day backup 20260120-010000 was not deduplicated" >&2; exit 1; }
[[ -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260119-120000" ]] || { echo "distinct day 20260119 was evicted by same-day deploys" >&2; exit 1; }
[[ -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260118-120000" ]] || { echo "distinct day 20260118 was evicted by same-day deploys" >&2; exit 1; }
[[ ! -d "${DAILY_DEDUP_BACKUP_ROOT}/postgres/daily/20260117-120000" ]] || { echo "day beyond RETENTION_DAILY=3 was not pruned" >&2; exit 1; }

MINIO_ROOT="${WORK_DIR}/minio-root"
MINIO_BACKUP_ROOT="${MINIO_ROOT}/minio/backups"
mkdir -p "${MINIO_BACKUP_ROOT}/postgres/daily/20260101-000000"

if AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${MINIO_ROOT}" \
  AQUILA_BACKUP_ROOT="${MINIO_BACKUP_ROOT}" \
  AQUILA_BACKUP_RETENTION_DAILY=1 \
  AQUILA_BACKUP_RETENTION_WEEKLY=1 \
  AQUILA_BACKUP_RETENTION_MONTHLY=1 \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
    "${PRUNE_SCRIPT}" --dry-run >/dev/null 2>&1; then
  echo "prune unexpectedly allowed backup root inside MinIO data" >&2
  exit 1
fi

[[ -d "${MINIO_BACKUP_ROOT}/postgres/daily/20260101-000000" ]]

MINIO_DOUBLE_SLASH_BACKUP_ROOT="${MINIO_ROOT}//minio/backups"

if AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${MINIO_ROOT}" \
  AQUILA_BACKUP_ROOT="${MINIO_DOUBLE_SLASH_BACKUP_ROOT}" \
  AQUILA_BACKUP_RETENTION_DAILY=1 \
  AQUILA_BACKUP_RETENTION_WEEKLY=1 \
  AQUILA_BACKUP_RETENTION_MONTHLY=1 \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
    "${PRUNE_SCRIPT}" --dry-run >/dev/null 2>&1; then
  echo "prune unexpectedly allowed backup root inside MinIO data via repeated slash" >&2
  exit 1
fi

KEY_SYMLINK_ROOT="${WORK_DIR}/key-symlink-root"
KEY_SYMLINK_EXTERNAL_ROOT="${KEY_SYMLINK_ROOT}/external"
KEY_SYMLINK_BACKUP_ROOT="${KEY_SYMLINK_EXTERNAL_ROOT}/backups"
mkdir -p "${KEY_SYMLINK_BACKUP_ROOT}/keys"
ln -s "${KEY_SYMLINK_BACKUP_ROOT}/keys" "${KEY_SYMLINK_EXTERNAL_ROOT}/keys"

if AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${KEY_SYMLINK_EXTERNAL_ROOT}" \
  AQUILA_BACKUP_ROOT="${KEY_SYMLINK_BACKUP_ROOT}" \
  AQUILA_BACKUP_ENCRYPTION_KEY_FILE="${KEY_SYMLINK_EXTERNAL_ROOT}/keys/backup-encryption.key" \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
    "${CREATE_SCRIPT}" >/dev/null 2>&1; then
  echo "backup unexpectedly allowed symlinked encryption key inside backup root" >&2
  exit 1
fi

KEY_PARENT_ROOT="${WORK_DIR}/key-parent-root"
KEY_PARENT_EXTERNAL_ROOT="${KEY_PARENT_ROOT}/external"
KEY_PARENT_BACKUP_ROOT="${KEY_PARENT_EXTERNAL_ROOT}/backups"
KEY_PARENT_FILE="${KEY_PARENT_EXTERNAL_ROOT}/keys/rotated/backup-encryption.key"
mkdir -p "${KEY_PARENT_EXTERNAL_ROOT}"

AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${KEY_PARENT_EXTERNAL_ROOT}" \
  AQUILA_BACKUP_ROOT="${KEY_PARENT_BACKUP_ROOT}" \
  AQUILA_BACKUP_ENCRYPTION_KEY_FILE="${KEY_PARENT_FILE}" \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
  AQUILA_BACKUP_SKIP_POSTGRES=true \
  AQUILA_BACKUP_SKIP_MINIO=true \
    "${CREATE_SCRIPT}" >/dev/null

[[ -s "${KEY_PARENT_FILE}" ]] || { echo "backup did not create custom encryption key with missing parent" >&2; exit 1; }

SKIP_TAG_ROOT="${WORK_DIR}/skip-tag-root"
SKIP_TAG_SCRIPT_DIR="${SKIP_TAG_ROOT}/deploy/homeserver"
SKIP_TAG_EXTERNAL_ROOT="${SKIP_TAG_ROOT}/external"
SKIP_TAG_BACKUP_ROOT="${SKIP_TAG_EXTERNAL_ROOT}/backups"
mkdir -p "${SKIP_TAG_SCRIPT_DIR}" "${SKIP_TAG_EXTERNAL_ROOT}"
cp "${CREATE_SCRIPT}" "${SKIP_TAG_SCRIPT_DIR}/create_external_backup.sh"
chmod +x "${SKIP_TAG_SCRIPT_DIR}/create_external_backup.sh"
cat > "${SKIP_TAG_SCRIPT_DIR}/.env.prod" <<'ENV'
CADDY_IMAGE=caddy:2.8-alpine
ENV

AQUILA_BACKUP_TIMESTAMP=20260101-030405 \
  AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${SKIP_TAG_EXTERNAL_ROOT}" \
  AQUILA_BACKUP_ROOT="${SKIP_TAG_BACKUP_ROOT}" \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
  AQUILA_BACKUP_SKIP_POSTGRES=true \
  AQUILA_BACKUP_SKIP_MINIO=true \
    "${SKIP_TAG_SCRIPT_DIR}/create_external_backup.sh" >/dev/null

SKIP_TAG_METADATA="${SKIP_TAG_BACKUP_ROOT}/deploy/daily/20260101-030405/metadata.env"
[[ -f "${SKIP_TAG_METADATA}" ]] || { echo "skip-tag deploy metadata was not written" >&2; exit 1; }
grep -q "secret_files_copied=false" "${SKIP_TAG_METADATA}" || { echo "skip-tag metadata missing secret-free marker" >&2; exit 1; }
if grep -q "CADDY_IMAGE=caddy:2.8-alpine" "${SKIP_TAG_METADATA}"; then
  echo "skip-tag metadata recorded a non-digest image tag" >&2
  exit 1
fi

FAILED_DUMP_ROOT="${WORK_DIR}/failed-dump-root"
FAILED_DUMP_SCRIPT_DIR="${FAILED_DUMP_ROOT}/deploy/homeserver"
FAILED_DUMP_EXTERNAL_ROOT="${FAILED_DUMP_ROOT}/external"
FAILED_DUMP_BACKUP_ROOT="${FAILED_DUMP_EXTERNAL_ROOT}/backups"
FAILED_DUMP_BIN="${FAILED_DUMP_ROOT}/bin"
mkdir -p "${FAILED_DUMP_SCRIPT_DIR}" "${FAILED_DUMP_EXTERNAL_ROOT}" "${FAILED_DUMP_BIN}"
cp "${CREATE_SCRIPT}" "${FAILED_DUMP_SCRIPT_DIR}/create_external_backup.sh"
chmod +x "${FAILED_DUMP_SCRIPT_DIR}/create_external_backup.sh"
cat > "${FAILED_DUMP_SCRIPT_DIR}/.env.prod" <<'ENV'
PROD___SPRING__DATASOURCE__USERNAME=blog_user
CUSTOM_PROD_DBNAME=blog_prod
ENV
cat > "${FAILED_DUMP_BIN}/docker" <<'SH'
#!/usr/bin/env bash
if [[ "$*" == *"pg_dump"* ]]; then
  printf 'partial-sql-stream'
  exit 1
fi
exit 0
SH
chmod +x "${FAILED_DUMP_BIN}/docker"

if PATH="${FAILED_DUMP_BIN}:${PATH}" \
  AQUILA_BACKUP_TIMESTAMP=20260101-090909 \
  AQUILA_EXTERNAL_STORAGE_ALLOW_TEST_ROOT=true \
  AQUILA_EXTERNAL_STORAGE_SKIP_MOUNT_CHECK=true \
  AQUILA_EXTERNAL_STORAGE_ROOT="${FAILED_DUMP_EXTERNAL_ROOT}" \
  AQUILA_BACKUP_ROOT="${FAILED_DUMP_BACKUP_ROOT}" \
  AQUILA_BACKUP_MIN_FREE_PERCENT=0 \
  AQUILA_BACKUP_SKIP_MINIO=true \
    "${FAILED_DUMP_SCRIPT_DIR}/create_external_backup.sh" >/dev/null 2>&1; then
  echo "create_external_backup.sh unexpectedly succeeded when pg_dump failed" >&2
  exit 1
fi

[[ ! -d "${FAILED_DUMP_BACKUP_ROOT}/postgres/daily/20260101-090909" ]] || { echo "failed pg_dump left partial postgres backup dir behind" >&2; exit 1; }
[[ ! -d "${FAILED_DUMP_BACKUP_ROOT}/deploy/daily/20260101-090909" ]] || { echo "failed backup run left partial deploy backup dir behind" >&2; exit 1; }

grep -q "sha256sums.txt" "${CREATE_SCRIPT}" || { echo "missing: sha256sums.txt generation in create_external_backup.sh" >&2; exit 1; }
grep -q "hmac-sha256.txt" "${CREATE_SCRIPT}" || { echo "missing: hmac-sha256.txt generation in create_external_backup.sh" >&2; exit 1; }
grep -q "stop_legacy_minio_for_migration" "${CREATE_SCRIPT}"
grep -q "docker stop" "${CREATE_SCRIPT}"
grep -q "MIGRATION_STOPPED_FILE" "${CREATE_SCRIPT}"
grep -q ".minio-migration" "${CREATE_SCRIPT}"
grep -q "LEGACY_MINIO_STOPPED_FOR_MIGRATION" "${CREATE_SCRIPT}"
grep -q "minio_dir=" "${CREATE_SCRIPT}"
grep -q "env_value_from_current_file CUSTOM_PROD_DBNAME" "${CREATE_SCRIPT}"
grep -q "^umask 077$" "${CREATE_SCRIPT}"
grep -q "backup-encryption.key" "${CREATE_SCRIPT}" || { echo "missing: default separated backup key path" >&2; exit 1; }
grep -q "canonical_path_for_compare" "${CREATE_SCRIPT}" || { echo "missing: canonical backup key path guard" >&2; exit 1; }
grep -q 'assert_outside_backup_root "AQUILA_BACKUP_ENCRYPTION_KEY_FILE"' "${CREATE_SCRIPT}" || { echo "missing: backup key must be outside backup root guard" >&2; exit 1; }
grep -q "openssl enc -aes-256-cbc -pbkdf2" "${CREATE_SCRIPT}" || { echo "missing: openssl encryption command" >&2; exit 1; }
grep -q "dump.sql.enc" "${CREATE_SCRIPT}" || { echo "missing: encrypted postgres dump artifact name" >&2; exit 1; }
grep -q "minio-data.tar.gz.enc" "${CREATE_SCRIPT}" || { echo "missing: encrypted minio archive artifact name" >&2; exit 1; }
grep -q "secret_files_copied=false" "${CREATE_SCRIPT}" || { echo "missing: secret-free backup manifest marker" >&2; exit 1; }
grep -q "metadata_backend_image_key" "${CREATE_SCRIPT}" || { echo "missing: deploy backup image metadata helper" >&2; exit 1; }
grep -q "back_blue_image" "${CREATE_SCRIPT}" || { echo "missing: deploy backup backend image metadata" >&2; exit 1; }
grep -q "COMPOSE_IMAGE_METADATA_KEYS" "${CREATE_SCRIPT}" || { echo "missing: non-backend image metadata key list" >&2; exit 1; }
grep -q "CADDY_IMAGE" "${CREATE_SCRIPT}" || { echo "missing: non-backend image metadata" >&2; exit 1; }
grep -q 'read_key_from_file "${image_key}" "${COMPOSE_ENV_FILE}"' "${CREATE_SCRIPT}" || { echo "missing: staged compose image metadata read" >&2; exit 1; }
if grep -q '\.env\.prod\.compose' "${CREATE_SCRIPT}"; then
  echo "external backup still references .env.prod.compose" >&2
  exit 1
fi
if grep -Eq 'for file in .*\.env\.prod(\.compose)?|cp .*\.env\.prod(\.compose)?|install .*\.env\.prod(\.compose)?' "${CREATE_SCRIPT}"; then
  echo "external backup still copies .env.prod" >&2
  exit 1
fi
grep -q "AQUILA_BACKUP_ROOT must not be inside the MinIO data directory" "${PRUNE_SCRIPT}"

echo "[external-storage-retention] ok"

