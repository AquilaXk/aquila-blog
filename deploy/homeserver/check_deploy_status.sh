#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
NETWORK_NAME="blog_home_default"

declare -a FAILURES=()

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

log() {
  echo "[check-deploy] $*"
}

remember_failure() {
  local message="$1"
  FAILURES+=("${message}")
  log "FAIL ${message}"
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      value=substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      print value
    }
  ' "${ENV_FILE}" | tail -n 1
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

cloudflared_registration_log_exists() {
  local logs="$1"
  if echo "${logs}" | grep -Eqi 'Registered tunnel connection|Connection .* registered'; then
    return 0
  fi
  return 1
}

public_http_reachable() {
  local code="$1"
  [[ "${code}" =~ ^[1-4][0-9][0-9]$ ]]
}

require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    echo "missing required file: ${path}" >&2
    exit 1
  fi
}

require_file "${COMPOSE_FILE}"
require_file "${ENV_FILE}"
require_file "${STATE_FILE}"

ACTIVE_BACKEND="$(cat "${STATE_FILE}" 2>/dev/null || true)"
EXPECTED_BACK_IMAGE="$(trim_quotes "$(env_value "BACK_IMAGE")")"
API_DOMAIN="$(trim_quotes "$(env_value "API_DOMAIN")")"

if [[ "${ACTIVE_BACKEND}" != "back_blue" && "${ACTIVE_BACKEND}" != "back_green" ]]; then
  remember_failure "invalid_active_backend=${ACTIVE_BACKEND:-none}"
fi

if [[ "${ACTIVE_BACKEND}" == "back_blue" ]]; then
  EXPECTED_UPSTREAM="back_blue"
  INACTIVE_BACKEND="back_green"
else
  EXPECTED_UPSTREAM="back_green"
  INACTIVE_BACKEND="back_blue"
fi

RUNNING_SERVICES="$(compose ps --status running --services 2>/dev/null || true)"
ACTIVE_BACKEND_CONTAINER_ID="$(compose ps -q "${ACTIVE_BACKEND}" 2>/dev/null | head -n 1 || true)"
ACTIVE_BACKEND_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${ACTIVE_BACKEND_CONTAINER_ID}" 2>/dev/null | tr -d '\r' || true)"

MOUNTED_UPSTREAM="$(
  compose exec -T caddy sh -lc \
    "awk '\$1 == \"reverse_proxy\" && \$2 ~ /^back[_-](blue|green):8080$/ {split(\$2, a, \":\"); print a[1]; exit}' ${CADDY_CONTAINER_FILE}" \
    2>/dev/null | tr -d '\r' | head -n 1 || true
)"
MOUNTED_UPSTREAM="${MOUNTED_UPSTREAM//-/_}"
HAS_LEGACY_BACK_ACTIVE="false"
if compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}" >/dev/null 2>&1; then
  HAS_LEGACY_BACK_ACTIVE="true"
fi

INTERNAL_HTTP_CODE="$(
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 3 \
    --max-time 8 \
    -H "Host: ${API_DOMAIN}" \
    "http://caddy:80/actuator/health/readiness" || true
)"

PUBLIC_HTTP_CODE="$(
  curl -sS --connect-timeout 5 -m 15 -o /dev/null -w "%{http_code}" \
    "https://${API_DOMAIN}/actuator/health/readiness" || true
)"

CLOUDFLARED_CONTAINER_ID="$(compose ps -q cloudflared 2>/dev/null | head -n 1 || true)"
CLOUDFLARED_STATUS="$(docker inspect --format '{{.State.Status}}' "${CLOUDFLARED_CONTAINER_ID}" 2>/dev/null || echo "missing")"
CLOUDFLARED_RESTARTING="$(docker inspect --format '{{.State.Restarting}}' "${CLOUDFLARED_CONTAINER_ID}" 2>/dev/null || echo "unknown")"
CLOUDFLARED_RESTART_COUNT="$(docker inspect --format '{{.RestartCount}}' "${CLOUDFLARED_CONTAINER_ID}" 2>/dev/null || echo "unknown")"
CLOUDFLARED_LOGS="$(compose logs --no-color --tail=120 cloudflared 2>/dev/null || true)"
CLOUDFLARED_HAS_REGISTRATION="false"
if cloudflared_registration_log_exists "${CLOUDFLARED_LOGS}"; then
  CLOUDFLARED_HAS_REGISTRATION="true"
fi
CLOUDFLARED_REGISTRATION_WARN="false"
if [[ "${CLOUDFLARED_HAS_REGISTRATION}" != "true" ]]; then
  CLOUDFLARED_REGISTRATION_WARN="true"
fi

log "active_backend=${ACTIVE_BACKEND:-none}"
log "expected_image=${EXPECTED_BACK_IMAGE:-none}"
log "active_image=${ACTIVE_BACKEND_IMAGE:-none}"
log "mounted_upstream=${MOUNTED_UPSTREAM:-none}"
log "inactive_backend=${INACTIVE_BACKEND}"
log "internal_readiness=${INTERNAL_HTTP_CODE:-none}"
log "public_readiness=${PUBLIC_HTTP_CODE:-none}"
log "cloudflared_status=${CLOUDFLARED_STATUS} restarting=${CLOUDFLARED_RESTARTING} restart_count=${CLOUDFLARED_RESTART_COUNT} registration=${CLOUDFLARED_HAS_REGISTRATION}"

if [[ -z "${EXPECTED_BACK_IMAGE}" ]]; then
  remember_failure "missing_expected_back_image"
fi

if [[ -z "${API_DOMAIN}" ]]; then
  remember_failure "missing_api_domain"
fi

if ! echo "${RUNNING_SERVICES}" | grep -qx "${ACTIVE_BACKEND}"; then
  remember_failure "active_backend_not_running=${ACTIVE_BACKEND:-none}"
fi

if [[ -z "${ACTIVE_BACKEND_CONTAINER_ID}" || -z "${ACTIVE_BACKEND_IMAGE}" ]]; then
  remember_failure "active_backend_image_inspect_failed=${ACTIVE_BACKEND:-none}"
elif [[ -n "${EXPECTED_BACK_IMAGE}" && "${ACTIVE_BACKEND_IMAGE}" != "${EXPECTED_BACK_IMAGE}" ]]; then
  remember_failure "active_backend_image_mismatch expected=${EXPECTED_BACK_IMAGE} actual=${ACTIVE_BACKEND_IMAGE}"
fi

if [[ -z "${MOUNTED_UPSTREAM}" || "${MOUNTED_UPSTREAM}" != "${EXPECTED_UPSTREAM}" || "${HAS_LEGACY_BACK_ACTIVE}" == "true" ]]; then
  remember_failure "caddy_upstream_mismatch expected=${EXPECTED_UPSTREAM} mounted=${MOUNTED_UPSTREAM:-none} legacy_back_active=${HAS_LEGACY_BACK_ACTIVE}"
fi

if echo "${RUNNING_SERVICES}" | grep -qx "${INACTIVE_BACKEND}"; then
  remember_failure "inactive_backend_still_running=${INACTIVE_BACKEND}"
fi

if [[ "${INTERNAL_HTTP_CODE}" != "200" ]]; then
  remember_failure "internal_caddy_readiness=${INTERNAL_HTTP_CODE:-none}"
fi

if ! public_http_reachable "${PUBLIC_HTTP_CODE}"; then
  remember_failure "public_readiness=${PUBLIC_HTTP_CODE:-none}"
fi

if [[ -z "${CLOUDFLARED_CONTAINER_ID}" ]]; then
  remember_failure "cloudflared_container_missing"
elif [[ "${CLOUDFLARED_STATUS}" != "running" || "${CLOUDFLARED_RESTARTING}" == "true" ]]; then
  remember_failure "cloudflared_unhealthy status=${CLOUDFLARED_STATUS} restarting=${CLOUDFLARED_RESTARTING}"
elif [[ "${CLOUDFLARED_RESTART_COUNT}" =~ ^[0-9]+$ ]] && (( CLOUDFLARED_RESTART_COUNT > 5 )); then
  remember_failure "cloudflared_restart_count=${CLOUDFLARED_RESTART_COUNT}"
fi

if [[ "${CLOUDFLARED_REGISTRATION_WARN}" == "true" ]]; then
  log "WARN cloudflared_registration_log_missing_recent_tail (container는 running 상태이며 readiness 결과를 우선 판단)"
fi

log "compose_ps_begin"
compose ps || true
log "compose_ps_end"

if [[ "${CLOUDFLARED_HAS_REGISTRATION}" == "true" ]]; then
  log "cloudflared_recent_registrations_begin"
  echo "${CLOUDFLARED_LOGS}" | grep -E "Registered tunnel connection|Connection .* registered" | tail -n 8 || true
  log "cloudflared_recent_registrations_end"
fi

if (( ${#FAILURES[@]} > 0 )); then
  log "result=FAIL"
  exit 1
fi

log "result=PASS"
