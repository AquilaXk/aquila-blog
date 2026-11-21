#!/usr/bin/env bash

set -euo pipefail

# 참조 구현: borgbackup/borg (BSD-3-Clause) & restic/restic (BSD-2-Clause) — 일일 자동 외장 백업 및 보존 정리 크론 스케줄

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/create_external_backup.sh"
PRUNE_SCRIPT="${SCRIPT_DIR}/prune_external_backups.sh"
LOG_FILE="${SCRIPT_DIR}/.external-backup-cron.log"
LOCK_FILE="${SCRIPT_DIR}/.external-backup-cron.lock"
CRON_SCHEDULE="${AQUILA_EXTERNAL_BACKUP_CRON_SCHEDULE:-15 3 * * *}"
CRON_MARKER="# aquila-external-backup-timer"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab command not found; skip external backup timer install" >&2
  exit 0
fi

if [[ ! -x "${BACKUP_SCRIPT}" ]]; then
  echo "external backup script is missing or not executable: ${BACKUP_SCRIPT}" >&2
  exit 1
fi

if [[ ! -x "${PRUNE_SCRIPT}" ]]; then
  echo "external backup prune script is missing or not executable: ${PRUNE_SCRIPT}" >&2
  exit 1
fi

if [[ ! "${CRON_SCHEDULE}" =~ ^[0-9*,/-]+[[:blank:]]+[0-9*,/-]+[[:blank:]]+[0-9*,/-]+[[:blank:]]+[0-9*,/-]+[[:blank:]]+[0-9*,/-]+$ ]]; then
  echo "invalid AQUILA_EXTERNAL_BACKUP_CRON_SCHEDULE: ${CRON_SCHEDULE}" >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
cleanup() {
  rm -f "${TMP_FILE}"
}
trap cleanup EXIT

ENTRY="${CRON_SCHEDULE} cd ${SCRIPT_DIR} && flock -n ${LOCK_FILE} bash -ec '\"\$1\" >/dev/null && \"\$2\"' _ ${BACKUP_SCRIPT} ${PRUNE_SCRIPT} >> ${LOG_FILE} 2>&1 ${CRON_MARKER}"

{
  crontab -l 2>/dev/null | grep -vE "create_external_backup\.sh|${CRON_MARKER}" || true
  echo "${ENTRY}"
} > "${TMP_FILE}"

crontab "${TMP_FILE}"

echo "external backup timer cron installed: ${ENTRY}"
