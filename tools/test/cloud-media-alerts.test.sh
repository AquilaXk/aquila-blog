#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RULES="$ROOT/deploy/homeserver/monitoring/rules/cloud-media-alerts.yml"

if [[ ! -f "$RULES" ]]; then
  echo "missing rules file: $RULES" >&2
  exit 1
fi

# Structural checks when promtool is unavailable.
required_alerts=(
  AquilaCloudUploadFailureRateWarning
  AquilaCloudUploadFailureRateCritical
  AquilaCloudUploadSessionStuck
  AquilaCloudPlayback5xxHigh
  AquilaCloudTempDiskLowWarning
  AquilaCloudTempDiskLowCritical
  AquilaCloudMinioDiskLowWarning
  AquilaCloudMinioDiskLowCritical
  AquilaCloudReconcileOrphansDetected
  AquilaCloudReconcileOrphansSpike
)

for alert in "${required_alerts[@]}"; do
  if ! grep -q "alert: ${alert}" "$RULES"; then
    echo "missing alert: ${alert}" >&2
    exit 1
  fi
done

if ! grep -q 'cloud_upload_session_transitions_total' "$RULES"; then
  echo "missing upload transition metric reference" >&2
  exit 1
fi

if ! grep -q 'aquila_host_filesystem_avail_bytes' "$RULES"; then
  echo "missing minio disk metric reference" >&2
  exit 1
fi

if command -v promtool >/dev/null 2>&1; then
  promtool check rules "$RULES"
  echo "promtool check rules: OK"
else
  echo "promtool not installed; structural alert checks: OK"
fi
