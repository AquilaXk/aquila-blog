#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD_SCRIPT="${SCRIPT_DIR}/steady_state_guard.sh"
LOG_FILE="${SCRIPT_DIR}/.steady-state-guard.log"

if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab command not found; skip steady-state guard schedule install" >&2
  exit 0
fi

if [[ ! -x "${GUARD_SCRIPT}" ]]; then
  echo "steady-state guard script is missing or not executable: ${GUARD_SCRIPT}" >&2
  exit 1
fi

ENTRY="* * * * * cd ${SCRIPT_DIR} && ${GUARD_SCRIPT} >> ${LOG_FILE} 2>&1"
TMP_FILE="$(mktemp)"

{
  crontab -l 2>/dev/null | grep -v 'steady_state_guard.sh' || true
  echo "${ENTRY}"
} > "${TMP_FILE}"

crontab "${TMP_FILE}"
rm -f "${TMP_FILE}"

echo "steady-state guard cron installed: ${ENTRY}"
