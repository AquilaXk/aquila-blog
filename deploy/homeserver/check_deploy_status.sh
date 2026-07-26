#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
EDGE_NETWORK_NAME="blog_home_edge"
APP_NETWORK_NAME="blog_home_app"
OBSERVE_NETWORK_NAME="blog_home_observe"
NETWORK_NAME="${EDGE_NETWORK_NAME}"

declare -a FAILURES=()

compose() {
  bash "${SCRIPT_DIR}/materialize_service_env.sh" "${ENV_FILE}"
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

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | on) printf 'true' ;;
    *) printf 'false' ;;
  esac
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

compose_service_runtime_state() {
  local service="$1"
  local cid status health restart_count oom_killed
  cid="$(compose ps -q "${service}" 2>/dev/null | head -n 1 || true)"
  if [[ -z "${cid}" ]]; then
    printf 'missing|none|0|unknown'
    return 0
  fi

  status="$(docker inspect --format '{{.State.Status}}' "${cid}" 2>/dev/null | tr -d '\r' || true)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null | tr -d '\r' || true)"
  restart_count="$(docker inspect --format '{{.RestartCount}}' "${cid}" 2>/dev/null | tr -d '\r' || true)"
  oom_killed="$(docker inspect --format '{{.State.OOMKilled}}' "${cid}" 2>/dev/null | tr -d '\r' || true)"
  printf '%s|%s|%s|%s' "${status:-unknown}" "${health:-unknown}" "${restart_count:-unknown}" "${oom_killed:-unknown}"
}

probe_internal_caddy_route_code() {
  local api_domain="$1"
  local path="$2"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 3 \
    --max-time 8 \
    -H "Host: ${api_domain}" \
    "http://caddy:80${path}" || true
}

probe_public_route_code() {
  local api_domain="$1"
  local path="$2"
  curl -sS --connect-timeout 5 -m 15 -o /dev/null -w "%{http_code}" \
    "https://${api_domain}${path}" || true
}

query_grafana_datasource_uid_status() {
  local uid="$1"
  local grafana_user grafana_password
  grafana_user="$(trim_quotes "$(env_value "GRAFANA_ADMIN_USER")")"
  grafana_password="$(trim_quotes "$(env_value "GRAFANA_ADMIN_PASSWORD")")"
  [[ -n "${grafana_user}" ]] || grafana_user="admin"
  [[ -n "${grafana_password}" ]] || grafana_password="change_me_grafana_password"

  local response code
  response="$(
    docker run --rm --network "${OBSERVE_NETWORK_NAME}" curlimages/curl:8.7.1 \
      --connect-timeout 3 \
      --max-time 8 \
      -sS \
      -u "${grafana_user}:${grafana_password}" \
      -w $'\nHTTP_STATUS:%{http_code}\n' \
      "http://grafana:3000/api/datasources/uid/${uid}" || true
  )"
  code="$(printf '%s\n' "${response}" | awk -F: '/^HTTP_STATUS:/ {print $2}' | tr -d '\r' | tail -n1)"
  [[ -n "${code}" ]] || code="none"
  if [[ "${code}" == "200" ]] && printf '%s' "${response}" | grep -q "\"uid\":\"${uid}\""; then
    printf '%s' "${code}"
    return 0
  fi
  printf '%s' "${code}"
  return 1
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
API_DOMAIN="$(trim_quotes "$(env_value "API_DOMAIN")")"
ADMIN_API_UPSTREAM="$(trim_quotes "$(env_value "ADMIN_API_UPSTREAM")")"
READ_API_UPSTREAM="$(trim_quotes "$(env_value "READ_API_UPSTREAM")")"
# Resolved exactly like caddy_upstream_probe.sh: an inherited value wins over the env file,
# so this check and the probe it runs alongside cannot disagree about the mode.
RUNTIME_SPLIT_ENABLED="$(normalize_bool "${RUNTIME_SPLIT_ENABLED:-$(trim_quotes "$(env_value "RUNTIME_SPLIT_ENABLED")")}")"

if [[ "${ACTIVE_BACKEND}" != "back_blue" && "${ACTIVE_BACKEND}" != "back_green" ]]; then
  remember_failure "invalid_active_backend=${ACTIVE_BACKEND:-none}"
fi

if [[ "${ACTIVE_BACKEND}" == "back_blue" ]]; then
  INACTIVE_BACKEND="back_green"
  ACTIVE_BACKEND_IMAGE_KEY="BACK_BLUE_IMAGE"
else
  INACTIVE_BACKEND="back_blue"
  ACTIVE_BACKEND_IMAGE_KEY="BACK_GREEN_IMAGE"
fi

# runtime-split serves the edge from back_read/back_admin through Caddyfile env
# placeholders, so a literal blue/green comparison reports a healthy split edge as a
# permanent upstream mismatch (#1418). Resolve both sides through the shared probe.
caddy_upstream_probe() {
  ENV_FILE="${ENV_FILE}" COMPOSE_FILE="${COMPOSE_FILE}" CADDY_CONTAINER_FILE="${CADDY_CONTAINER_FILE}" \
    bash "${SCRIPT_DIR}/caddy_upstream_probe.sh" "$@"
}

EXPECTED_UPSTREAM=""
if ! EXPECTED_UPSTREAM="$(caddy_upstream_probe expected "${ACTIVE_BACKEND}")"; then
  remember_failure "caddy_upstream_expectation_unresolved active_backend=${ACTIVE_BACKEND:-none}"
fi
EXPECTED_BACK_IMAGE="$(trim_quotes "$(env_value "${ACTIVE_BACKEND_IMAGE_KEY}")")"

RUNNING_SERVICES="$(compose ps --status running --services 2>/dev/null || true)"
ACTIVE_BACKEND_CONTAINER_ID="$(compose ps -q "${ACTIVE_BACKEND}" 2>/dev/null | head -n 1 || true)"
ACTIVE_BACKEND_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${ACTIVE_BACKEND_CONTAINER_ID}" 2>/dev/null | tr -d '\r' || true)"

MOUNTED_UPSTREAM="$(caddy_upstream_probe mounted || true)"
HAS_LEGACY_BACK_ACTIVE="false"
if compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}" >/dev/null 2>&1; then
  HAS_LEGACY_BACK_ACTIVE="true"
fi

# Out-of-band detector for a runtime-split edge that serves literal colour upstreams. The
# mounted_upstream comparison above resolves one token, so a drift that spares the first
# reverse_proxy line (a read-only or forward_auth route pinned to a colour) passes it while
# read/admin isolation is off for those routes. blue_green_deploy.sh warns about the same
# state and rollback_last_deploy.sh cannot fail on it without stretching an outage
# (#1409), so this is where a degraded split edge turns into a FAIL an operator can see.
HAS_SPLIT_LITERAL_UPSTREAM="false"
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  if compose exec -T caddy sh -lc "grep -Eq '^[[:space:]]*(reverse_proxy|forward_auth)[[:space:]]+back[-_](blue|green|active):8080([[:space:]]|\$)' ${CADDY_CONTAINER_FILE}" >/dev/null 2>&1; then
    HAS_SPLIT_LITERAL_UPSTREAM="true"
  fi
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
  probe_public_route_code "${API_DOMAIN}" "/actuator/health/readiness"
)"
INTERNAL_NOTIFICATION_SNAPSHOT_HTTP_CODE="$(
  probe_internal_caddy_route_code "${API_DOMAIN}" "/member/api/v1/notifications/snapshot"
)"
PUBLIC_NOTIFICATION_SNAPSHOT_HTTP_CODE="$(
  probe_public_route_code "${API_DOMAIN}" "/member/api/v1/notifications/snapshot"
)"
BACK_ADMIN_RUNTIME_STATE="$(compose_service_runtime_state "back_admin")"
BACK_READ_RUNTIME_STATE="$(compose_service_runtime_state "back_read")"
IFS='|' read -r BACK_ADMIN_STATUS BACK_ADMIN_HEALTH BACK_ADMIN_RESTART_COUNT BACK_ADMIN_OOM_KILLED <<< "${BACK_ADMIN_RUNTIME_STATE}"
IFS='|' read -r BACK_READ_STATUS BACK_READ_HEALTH BACK_READ_RESTART_COUNT BACK_READ_OOM_KILLED <<< "${BACK_READ_RUNTIME_STATE}"

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

LOKI_CONTAINER_ID="$(compose ps -q loki 2>/dev/null | head -n 1 || true)"
LOKI_STATUS="$(docker inspect --format '{{.State.Status}}' "${LOKI_CONTAINER_ID}" 2>/dev/null || echo "missing")"
LOKI_RESTARTING="$(docker inspect --format '{{.State.Restarting}}' "${LOKI_CONTAINER_ID}" 2>/dev/null || echo "unknown")"

PROMTAIL_CONTAINER_ID="$(compose ps -q promtail 2>/dev/null | head -n 1 || true)"
PROMTAIL_STATUS="$(docker inspect --format '{{.State.Status}}' "${PROMTAIL_CONTAINER_ID}" 2>/dev/null || echo "missing")"
PROMTAIL_RESTARTING="$(docker inspect --format '{{.State.Restarting}}' "${PROMTAIL_CONTAINER_ID}" 2>/dev/null || echo "unknown")"

GRAFANA_LOKI_DS_STATUS="none"
if [[ "${LOKI_STATUS}" == "running" ]]; then
  if GRAFANA_LOKI_DS_STATUS="$(query_grafana_datasource_uid_status "loki")"; then
    :
  fi
fi

log "active_backend=${ACTIVE_BACKEND:-none}"
log "expected_image=${EXPECTED_BACK_IMAGE:-none}"
log "active_image=${ACTIVE_BACKEND_IMAGE:-none}"
log "mounted_upstream=${MOUNTED_UPSTREAM:-none}"
log "inactive_backend=${INACTIVE_BACKEND}"
log "admin_api_upstream=${ADMIN_API_UPSTREAM:-none}"
log "read_api_upstream=${READ_API_UPSTREAM:-none}"
log "runtime_split_enabled=${RUNTIME_SPLIT_ENABLED} split_literal_upstream=${HAS_SPLIT_LITERAL_UPSTREAM}"
log "internal_readiness=${INTERNAL_HTTP_CODE:-none}"
log "public_readiness=${PUBLIC_HTTP_CODE:-none}"
log "internal_notification_snapshot=${INTERNAL_NOTIFICATION_SNAPSHOT_HTTP_CODE:-none}"
log "public_notification_snapshot=${PUBLIC_NOTIFICATION_SNAPSHOT_HTTP_CODE:-none}"
log "back_admin_runtime=status:${BACK_ADMIN_STATUS} health:${BACK_ADMIN_HEALTH} restart_count:${BACK_ADMIN_RESTART_COUNT} oom_killed:${BACK_ADMIN_OOM_KILLED}"
log "back_read_runtime=status:${BACK_READ_STATUS} health:${BACK_READ_HEALTH} restart_count:${BACK_READ_RESTART_COUNT} oom_killed:${BACK_READ_OOM_KILLED}"
log "cloudflared_status=${CLOUDFLARED_STATUS} restarting=${CLOUDFLARED_RESTARTING} restart_count=${CLOUDFLARED_RESTART_COUNT} registration=${CLOUDFLARED_HAS_REGISTRATION}"
log "loki_status=${LOKI_STATUS} restarting=${LOKI_RESTARTING}"
log "promtail_status=${PROMTAIL_STATUS} restarting=${PROMTAIL_RESTARTING}"
log "grafana_loki_datasource_status=${GRAFANA_LOKI_DS_STATUS}"

if [[ -z "${EXPECTED_BACK_IMAGE}" ]]; then
  remember_failure "missing_expected_back_image key=${ACTIVE_BACKEND_IMAGE_KEY:-none}"
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

if [[ "${HAS_SPLIT_LITERAL_UPSTREAM}" == "true" ]]; then
  remember_failure "caddy_split_literal_upstream runtime_split_enabled=${RUNTIME_SPLIT_ENABLED} read_api_upstream=${READ_API_UPSTREAM:-none} admin_api_upstream=${ADMIN_API_UPSTREAM:-none}"
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

if ! public_http_reachable "${INTERNAL_NOTIFICATION_SNAPSHOT_HTTP_CODE}"; then
  remember_failure "internal_notification_snapshot=${INTERNAL_NOTIFICATION_SNAPSHOT_HTTP_CODE:-none}"
fi

if ! public_http_reachable "${PUBLIC_NOTIFICATION_SNAPSHOT_HTTP_CODE}"; then
  remember_failure "public_notification_snapshot=${PUBLIC_NOTIFICATION_SNAPSHOT_HTTP_CODE:-none}"
fi

if [[ "${ADMIN_API_UPSTREAM}" == "back_admin" ]] && [[ "${BACK_ADMIN_STATUS}" != "running" || "${BACK_ADMIN_HEALTH}" != "healthy" ]]; then
  remember_failure "back_admin_unhealthy status=${BACK_ADMIN_STATUS} health=${BACK_ADMIN_HEALTH} restart_count=${BACK_ADMIN_RESTART_COUNT} oom_killed=${BACK_ADMIN_OOM_KILLED}"
fi

if [[ "${READ_API_UPSTREAM}" == "back_read" ]] && [[ "${BACK_READ_STATUS}" != "running" || "${BACK_READ_HEALTH}" != "healthy" ]]; then
  remember_failure "back_read_unhealthy status=${BACK_READ_STATUS} health=${BACK_READ_HEALTH} restart_count=${BACK_READ_RESTART_COUNT} oom_killed=${BACK_READ_OOM_KILLED}"
fi

if [[ -z "${CLOUDFLARED_CONTAINER_ID}" ]]; then
  remember_failure "cloudflared_container_missing"
elif [[ "${CLOUDFLARED_STATUS}" != "running" || "${CLOUDFLARED_RESTARTING}" == "true" ]]; then
  remember_failure "cloudflared_unhealthy status=${CLOUDFLARED_STATUS} restarting=${CLOUDFLARED_RESTARTING}"
elif [[ "${CLOUDFLARED_RESTART_COUNT}" =~ ^[0-9]+$ ]] && (( CLOUDFLARED_RESTART_COUNT > 5 )); then
  remember_failure "cloudflared_restart_count=${CLOUDFLARED_RESTART_COUNT}"
fi

if [[ -z "${LOKI_CONTAINER_ID}" ]]; then
  remember_failure "loki_container_missing"
elif [[ "${LOKI_STATUS}" != "running" || "${LOKI_RESTARTING}" == "true" ]]; then
  remember_failure "loki_unhealthy status=${LOKI_STATUS} restarting=${LOKI_RESTARTING}"
fi

if [[ -z "${PROMTAIL_CONTAINER_ID}" ]]; then
  remember_failure "promtail_container_missing"
elif [[ "${PROMTAIL_STATUS}" != "running" || "${PROMTAIL_RESTARTING}" == "true" ]]; then
  remember_failure "promtail_unhealthy status=${PROMTAIL_STATUS} restarting=${PROMTAIL_RESTARTING}"
fi

if [[ "${LOKI_STATUS}" == "running" ]] && [[ "${GRAFANA_LOKI_DS_STATUS}" != "200" ]]; then
  remember_failure "grafana_loki_datasource_unhealthy status=${GRAFANA_LOKI_DS_STATUS}"
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
