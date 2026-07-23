#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 ]]; then
  echo "[current-task-read-field] usage: $0 <field>" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
source "${REPO_ROOT}/tools/guards/current-task-common.sh"

CURRENT_TASK_FILE="$(bash "${REPO_ROOT}/tools/guards/current-task-resolve.sh")"
current_task_read_field "${CURRENT_TASK_FILE}" "$1"
