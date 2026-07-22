#!/usr/bin/env bash
# 5GB-class multipart upload throughput harness (curl; optional mc notes).
# k6 cloud-upload-parts-load.js는 part API 지연/동시 세션만 측정한다.
#
# Required env:
#   BASE_URL          API origin (default: https://api.aquilaxk.site)
#   CLOUD_AUTH_COOKIE or CLOUD_AUTH_HEADER
# Optional:
#   TARGET_GIB        total upload size in GiB (default: 5)
#   PART_SIZE_BYTES   part size (default: 67108864 = 64MiB)
#   UPLOAD_FOLDER     cloud folder path (default: /perf-k6)
#   OUT_DIR           results directory (default: perf/k6/results)
#   SKIP_COMPLETE=1   cancel instead of complete (default: complete)
#
# Example:
#   BASE_URL="https://api.aquilaxk.site" \
#   CLOUD_AUTH_COOKIE="accessToken=..." \
#   ./perf/k6/cloud-upload-5gb-measure.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-https://api.aquilaxk.site}"
BASE_URL="${BASE_URL%/}"
CLOUD_API="${BASE_URL}/system/api/v1/adm/cloud"
TARGET_GIB="${TARGET_GIB:-5}"
PART_SIZE_BYTES="${PART_SIZE_BYTES:-67108864}"
UPLOAD_FOLDER="${UPLOAD_FOLDER:-/perf-k6}"
OUT_DIR="${OUT_DIR:-${SCRIPT_DIR}/results}"
UPLOAD_FILENAME="${UPLOAD_FILENAME:-perf-5gb-measure.bin}"
UPLOAD_CONTENT_TYPE="${UPLOAD_CONTENT_TYPE:-application/octet-stream}"
SKIP_COMPLETE="${SKIP_COMPLETE:-0}"

if [[ -z "${CLOUD_AUTH_COOKIE:-}" && -z "${CLOUD_AUTH_HEADER:-}" ]]; then
  echo "error: set CLOUD_AUTH_COOKIE or CLOUD_AUTH_HEADER" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SUMMARY_FILE="${OUT_DIR}/cloud-upload-5gb-${TIMESTAMP}.json"
PART_FILE="${TMPDIR:-/tmp}/cloud-upload-part-${TIMESTAMP}.bin"

cleanup() {
  rm -f "${PART_FILE}"
}
trap cleanup EXIT

curl_auth_args=(-sS)
if [[ -n "${CLOUD_AUTH_COOKIE:-}" ]]; then
  curl_auth_args+=(-H "Cookie: ${CLOUD_AUTH_COOKIE}")
fi
if [[ -n "${CLOUD_AUTH_HEADER:-}" ]]; then
  curl_auth_args+=(-H "Authorization: ${CLOUD_AUTH_HEADER}")
fi

BYTE_SIZE=$((TARGET_GIB * 1024 * 1024 * 1024))
TOTAL_PARTS=$(( (BYTE_SIZE + PART_SIZE_BYTES - 1) / PART_SIZE_BYTES ))

echo "creating ${TARGET_GIB}GiB session (${TOTAL_PARTS} parts x ${PART_SIZE_BYTES} bytes)..."

SESSION_JSON="$(curl "${curl_auth_args[@]}" \
  -X POST "${CLOUD_API}/files/video-upload-sessions" \
  -H "Content-Type: application/json" \
  -d "{\"originalFilename\":\"${UPLOAD_FILENAME}\",\"contentType\":\"${UPLOAD_CONTENT_TYPE}\",\"byteSize\":${BYTE_SIZE},\"folderPath\":\"${UPLOAD_FOLDER}\"}")"

SESSION_ID="$(printf '%s' "${SESSION_JSON}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);process.stdout.write(String(j.data?.id||""));});')"
if [[ -z "${SESSION_ID}" ]]; then
  echo "session create failed: ${SESSION_JSON}" >&2
  exit 1
fi

# single reusable part payload on disk (last part may be smaller — handled per request)
dd if=/dev/zero of="${PART_FILE}" bs="${PART_SIZE_BYTES}" count=1 status=none 2>/dev/null

START_EPOCH="$(date +%s)"
UPLOADED_BYTES=0
PART_DURATIONS_MS=()

for (( part=1; part<=TOTAL_PARTS; part++ )); do
  if (( part == TOTAL_PARTS )); then
    LAST_SIZE=$((BYTE_SIZE - PART_SIZE_BYTES * (TOTAL_PARTS - 1)))
    dd if=/dev/zero of="${PART_FILE}" bs="${LAST_SIZE}" count=1 status=none 2>/dev/null
    THIS_SIZE="${LAST_SIZE}"
  else
    THIS_SIZE="${PART_SIZE_BYTES}"
  fi

  PART_START="$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)"
  HTTP_CODE="$(curl "${curl_auth_args[@]}" -o /dev/null -w '%{http_code}' \
    -X PUT "${CLOUD_API}/files/video-upload-sessions/${SESSION_ID}/parts/${part}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"${PART_FILE}")"
  PART_END="$(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
)"
  PART_MS=$((PART_END - PART_START))
  PART_DURATIONS_MS+=("${PART_MS}")

  if [[ "${HTTP_CODE}" != "200" ]]; then
    echo "part ${part} failed: HTTP ${HTTP_CODE}" >&2
    curl "${curl_auth_args[@]}" -X DELETE "${CLOUD_API}/files/video-upload-sessions/${SESSION_ID}" >/dev/null || true
    exit 1
  fi
  UPLOADED_BYTES=$((UPLOADED_BYTES + THIS_SIZE))
  echo "part ${part}/${TOTAL_PARTS} ok (${THIS_SIZE} bytes, ${PART_MS}ms)"
done

END_EPOCH="$(date +%s)"
ELAPSED_SEC=$((END_EPOCH - START_EPOCH))
THROUGHPUT_MBPS="0"
if (( ELAPSED_SEC > 0 )); then
  THROUGHPUT_MBPS="$(python3 - <<PY
uploaded = ${UPLOADED_BYTES}
elapsed = ${ELAPSED_SEC}
print(f"{(uploaded * 8 / elapsed / 1_000_000):.3f}")
PY
)"
fi

FINAL_ACTION="complete"
if [[ "${SKIP_COMPLETE}" == "1" ]]; then
  FINAL_ACTION="cancel"
  curl "${curl_auth_args[@]}" -X DELETE "${CLOUD_API}/files/video-upload-sessions/${SESSION_ID}" >/dev/null
else
  curl "${curl_auth_args[@]}" -X POST "${CLOUD_API}/files/video-upload-sessions/${SESSION_ID}/complete" >/dev/null
fi

node - <<NODE >"${SUMMARY_FILE}"
const summary = {
  measuredAt: new Date().toISOString(),
  baseUrl: ${BASE_URL@Q},
  sessionId: ${SESSION_ID},
  targetGib: ${TARGET_GIB},
  byteSize: ${BYTE_SIZE},
  partSizeBytes: ${PART_SIZE_BYTES},
  totalParts: ${TOTAL_PARTS},
  elapsedSec: ${ELAPSED_SEC},
  uploadedBytes: ${UPLOADED_BYTES},
  throughputMbps: Number(${THROUGHPUT_MBPS@Q}),
  finalAction: ${FINAL_ACTION@Q},
  partDurationMs: [$(IFS=,; echo "${PART_DURATIONS_MS[*]}")],
  notes: [
    "Run from external uplink (not LAN) for launch criteria.",
    "Compare throughputMbps against uplink baseline x 0.70 in cloud-launch-criteria.md.",
    "Optional: mc cp to MinIO bucket for storage-only baseline (not included)."
  ]
};
console.log(JSON.stringify(summary, null, 2));
NODE

echo "summary=${SUMMARY_FILE}"
echo "elapsed_sec=${ELAPSED_SEC} throughput_mbps=${THROUGHPUT_MBPS} action=${FINAL_ACTION}"
