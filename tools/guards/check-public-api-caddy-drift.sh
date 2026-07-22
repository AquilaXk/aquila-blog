#!/usr/bin/env bash
# Compare Caddy @publicReadFallback path set with SoT export snapshot.
# Snapshot is validated against Kotlin PublicApiRouteContributor SoT in
# PublicApiCaddyDriftTest. Drift => exit 1.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOT_FILE="${ROOT_DIR}/tools/guards/public-api-read-caddy-paths.sot"
CADDYFILE="${ROOT_DIR}/deploy/homeserver/caddy/Caddyfile"

if [[ ! -f "${SOT_FILE}" ]]; then
  echo "missing SoT export: ${SOT_FILE}" >&2
  exit 1
fi
if [[ ! -f "${CADDYFILE}" ]]; then
  echo "missing Caddyfile: ${CADDYFILE}" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

sot_sorted="${tmp_dir}/sot.txt"
caddy_sorted="${tmp_dir}/caddy.txt"

grep -v '^[[:space:]]*$' "${SOT_FILE}" | grep -v '^#' | sort -u >"${sot_sorted}"

awk '
  $1 == "@publicReadFallback" { in_block = 1; next }
  in_block && $1 == "path" {
    for (i = 2; i <= NF; i++) print $i
    next
  }
  in_block && /^[[:space:]]*}/ { in_block = 0 }
' "${CADDYFILE}" | sort -u >"${caddy_sorted}"

if [[ ! -s "${caddy_sorted}" ]]; then
  echo "failed to parse @publicReadFallback path list from ${CADDYFILE}" >&2
  exit 1
fi

if ! diff -u "${sot_sorted}" "${caddy_sorted}"; then
  echo "public-read Caddy path drift detected (SoT snapshot vs Caddyfile @publicReadFallback)." >&2
  echo "Update deploy/homeserver/caddy/Caddyfile and tools/guards/public-api-read-caddy-paths.sot together with PublicApiRouteContributor changes." >&2
  exit 1
fi

echo "public-api Caddy drift check passed ($(($(wc -l <"${sot_sorted}"))) paths)."
