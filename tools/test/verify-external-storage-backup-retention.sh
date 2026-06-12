#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRUNE_SCRIPT="${ROOT_DIR}/deploy/homeserver/prune_external_backups.sh"

if [[ ! -x "${PRUNE_SCRIPT}" ]]; then
  echo "missing executable prune script: ${PRUNE_SCRIPT}" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

BACKUP_ROOT="${WORK_DIR}/backups"

make_backups() {
  local category="$1"
  local class="$2"
  local count="$3"
  local pattern="$4"
  local dir

  for index in $(seq 1 "${count}"); do
    printf -v dir "${pattern}" "${index}"
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

echo "[external-storage-retention] ok"
