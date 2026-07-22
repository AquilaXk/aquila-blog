#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

hits="$(rg -n --glob '*.tf' --glob '!infra/legacy/**' --glob '!**/.git/**' --glob '!**/node_modules/**' '0\.0\.0\.0/0' . || true)"
if [[ -n "${hits}" ]]; then
  echo "FAIL: world-open CIDR 0.0.0.0/0 found outside infra/legacy/:" >&2
  echo "${hits}" >&2
  exit 1
fi

if [[ ! -f infra/legacy/main.tf ]]; then
  echo "FAIL: expected infra/legacy/main.tf quarantine file missing" >&2
  exit 1
fi

echo "terraform world-open SG guard passed (active .tf clean; legacy quarantined)"
