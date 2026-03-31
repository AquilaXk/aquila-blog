#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
CADDY_HOST_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
NETWORK_NAME="blog_home_default"
LOCK_DIR="${SCRIPT_DIR}/.steady-state-guard.lock"
DEPLOY_LOCK_DIR="${SCRIPT_DIR}/.deploy.lock"
DEPLOY_LOCK_TTL_SECONDS="${DEPLOY_LOCK_TTL_SECONDS:-21600}"
GRAFANA_DS_STATE_FILE="${SCRIPT_DIR}/.grafana-datasource-state"
GRAFANA_EMBED_STATE_FILE="${SCRIPT_DIR}/.grafana-embed-state"
NOTIFICATION_SSE_STATE_FILE="${SCRIPT_DIR}/.notification-sse-state"

log() {
  echo "[steady-guard] $(date -Is) $*"
}

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {print substr($0, index($0, "=") + 1); exit}' "${ENV_FILE}"
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

normalize_positive_int() {
  local value="$1"
  local fallback="$2"
  if [[ "${value}" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s' "${value}"
  else
    printf '%s' "${fallback}"
  fi
}

normalize_non_negative_int() {
  local value="$1"
  local fallback="$2"
  if [[ "${value}" =~ ^[0-9]+$ ]]; then
    printf '%s' "${value}"
  else
    printf '%s' "${fallback}"
  fi
}

GRAFANA_DS_FAIL_COUNT=0
GRAFANA_DS_LAST_RECREATE_EPOCH=0
GRAFANA_EMBED_FAIL_COUNT=0
GRAFANA_EMBED_LAST_RECREATE_EPOCH=0
NOTIFICATION_SSE_FAIL_COUNT=0
NOTIFICATION_SSE_LAST_RECREATE_EPOCH=0

load_grafana_ds_state() {
  GRAFANA_DS_FAIL_COUNT=0
  GRAFANA_DS_LAST_RECREATE_EPOCH=0
  [[ -f "${GRAFANA_DS_STATE_FILE}" ]] || return 0

  local fail_count_raw last_recreate_raw
  fail_count_raw="$(awk -F= '$1 == "fail_count" {print $2; exit}' "${GRAFANA_DS_STATE_FILE}" 2>/dev/null || true)"
  last_recreate_raw="$(awk -F= '$1 == "last_recreate_epoch" {print $2; exit}' "${GRAFANA_DS_STATE_FILE}" 2>/dev/null || true)"

  if [[ "${fail_count_raw}" =~ ^[0-9]+$ ]]; then
    GRAFANA_DS_FAIL_COUNT="${fail_count_raw}"
  fi
  if [[ "${last_recreate_raw}" =~ ^[0-9]+$ ]]; then
    GRAFANA_DS_LAST_RECREATE_EPOCH="${last_recreate_raw}"
  fi
}

save_grafana_ds_state() {
  printf 'fail_count=%s\nlast_recreate_epoch=%s\n' "${GRAFANA_DS_FAIL_COUNT}" "${GRAFANA_DS_LAST_RECREATE_EPOCH}" > "${GRAFANA_DS_STATE_FILE}"
}

load_grafana_embed_state() {
  GRAFANA_EMBED_FAIL_COUNT=0
  GRAFANA_EMBED_LAST_RECREATE_EPOCH=0
  [[ -f "${GRAFANA_EMBED_STATE_FILE}" ]] || return 0

  local fail_count_raw last_recreate_raw
  fail_count_raw="$(awk -F= '$1 == "fail_count" {print $2; exit}' "${GRAFANA_EMBED_STATE_FILE}" 2>/dev/null || true)"
  last_recreate_raw="$(awk -F= '$1 == "last_recreate_epoch" {print $2; exit}' "${GRAFANA_EMBED_STATE_FILE}" 2>/dev/null || true)"

  if [[ "${fail_count_raw}" =~ ^[0-9]+$ ]]; then
    GRAFANA_EMBED_FAIL_COUNT="${fail_count_raw}"
  fi
  if [[ "${last_recreate_raw}" =~ ^[0-9]+$ ]]; then
    GRAFANA_EMBED_LAST_RECREATE_EPOCH="${last_recreate_raw}"
  fi
}

save_grafana_embed_state() {
  printf 'fail_count=%s\nlast_recreate_epoch=%s\n' "${GRAFANA_EMBED_FAIL_COUNT}" "${GRAFANA_EMBED_LAST_RECREATE_EPOCH}" > "${GRAFANA_EMBED_STATE_FILE}"
}

load_notification_sse_state() {
  NOTIFICATION_SSE_FAIL_COUNT=0
  NOTIFICATION_SSE_LAST_RECREATE_EPOCH=0
  [[ -f "${NOTIFICATION_SSE_STATE_FILE}" ]] || return 0

  local fail_count_raw last_recreate_raw
  fail_count_raw="$(awk -F= '$1 == "fail_count" {print $2; exit}' "${NOTIFICATION_SSE_STATE_FILE}" 2>/dev/null || true)"
  last_recreate_raw="$(awk -F= '$1 == "last_recreate_epoch" {print $2; exit}' "${NOTIFICATION_SSE_STATE_FILE}" 2>/dev/null || true)"

  if [[ "${fail_count_raw}" =~ ^[0-9]+$ ]]; then
    NOTIFICATION_SSE_FAIL_COUNT="${fail_count_raw}"
  fi
  if [[ "${last_recreate_raw}" =~ ^[0-9]+$ ]]; then
    NOTIFICATION_SSE_LAST_RECREATE_EPOCH="${last_recreate_raw}"
  fi
}

save_notification_sse_state() {
  printf 'fail_count=%s\nlast_recreate_epoch=%s\n' "${NOTIFICATION_SSE_FAIL_COUNT}" "${NOTIFICATION_SSE_LAST_RECREATE_EPOCH}" > "${NOTIFICATION_SSE_STATE_FILE}"
}

monitoring_embed_candidate_url() {
  local url
  url="$(trim_quotes "$(env_value "NEXT_PUBLIC_MONITORING_EMBED_URL")")"
  if [[ -z "${url}" ]]; then
    url="$(trim_quotes "$(env_value "NEXT_PUBLIC_GRAFANA_EMBED_URL")")"
  fi
  if [[ -z "${url}" ]]; then
    local grafana_domain
    grafana_domain="$(trim_quotes "$(env_value "GRAFANA_DOMAIN")")"
    if [[ -n "${grafana_domain}" ]]; then
      url="https://${grafana_domain}/d/blog-overview/main?orgId=1&kiosk"
    fi
  fi
  printf '%s' "${url}"
}

monitoring_embed_candidate_path() {
  local url
  url="$(monitoring_embed_candidate_url)"
  if [[ -z "${url}" ]]; then
    echo "/d/blog-overview/main?orgId=1&kiosk"
    return 0
  fi
  printf '%s' "${url}" | sed -E 's#https?://[^/]+##'
}

is_grafana_embed_url() {
  local url="$1"
  [[ "${url}" == *"grafana"* || "${url}" == *"/d/"* || "${url}" == *"/public-dashboards/"* ]]
}

inspect_grafana_embed_headers() {
  local url="$1"
  curl -I -s --max-time 10 "${url}" 2>/dev/null || true
}

inspect_grafana_internal_health() {
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://grafana:3000/api/health" 2>/dev/null || true
}

grafana_embed_headers_are_healthy() {
  local headers="$1"
  local internal_health="$2"
  local status location xfo csp
  status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
  location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
  xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
  csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"

  if [[ "${internal_health}" != "200" ]]; then
    return 1
  fi
  if [[ -z "${status}" || "${status}" == "none" ]]; then
    return 1
  fi
  if [[ "${status}" != "200" && "${status}" != "401" && "${status}" != "403" ]]; then
    return 1
  fi
  if [[ -n "${location}" && "${location}" == *"/login"* ]]; then
    return 1
  fi
  if [[ -n "${xfo}" && "${xfo}" =~ [Dd][Ee][Nn][Yy]|[Ss][Aa][Mm][Ee][Oo][Rr][Ii][Gg][Ii][Nn] ]]; then
    return 1
  fi
  if [[ -n "${csp}" && "${csp}" == *"frame-ancestors"* && "${csp}" != *"aquilaxk.site"* && "${csp}" != *"*"* ]]; then
    return 1
  fi

  return 0
}

probe_grafana_embed_origin_headers() {
  local api_domain="$1"
  local grafana_domain="$2"
  local path="$3"
  local admin_email="$4"
  local admin_password="$5"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
    set -eu
    api_domain="$1"
    grafana_domain="$2"
    path="$3"
    admin_email="$4"
    admin_password="$5"
    cookie_jar="$(mktemp)"
    trap "rm -f \"${cookie_jar}\"" EXIT
    login_payload="{\"email\":\"${admin_email}\",\"password\":\"${admin_password}\"}"
    login_code="$(
      curl -sS \
        --connect-timeout 3 \
        --max-time 12 \
        -c "${cookie_jar}" \
        -o /dev/null \
        -w "%{http_code}" \
        -H "Host: ${api_domain}" \
        -H "Content-Type: application/json" \
        --data "${login_payload}" \
        "http://caddy:80/member/api/v1/auth/login" || true
    )"
    if ! printf "%s" "${login_code}" | grep -Eq "^2[0-9][0-9]$"; then
      printf "HTTP/1.1 000 login_failed\r\n"
      exit 0
    fi
    curl -I -s \
      --connect-timeout 3 \
      --max-time 12 \
      -b "${cookie_jar}" \
      -H "Host: ${grafana_domain}" \
      "http://caddy:80${path}" || true
  ' sh "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}" 2>/dev/null || true
}

host_caddy_sha256() {
  sha256sum "${CADDY_HOST_FILE}" 2>/dev/null | awk '{print $1}' | tr -d '\r'
}

mounted_caddy_sha256() {
  compose exec -T caddy sh -lc "sha256sum ${CADDY_CONTAINER_FILE} | awk '{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1
}

list_running_backends() {
  compose ps --status running --services 2>/dev/null | grep -E '^back_(blue|green)$' || true
}

resolve_active_backend() {
  local active
  active="$(cat "${STATE_FILE}" 2>/dev/null || true)"
  if [[ "${active}" == "back_blue" || "${active}" == "back_green" ]]; then
    if compose ps --status running --services 2>/dev/null | grep -qx "${active}"; then
      printf '%s' "${active}"
      return 0
    fi
  fi

  active="$(list_running_backends | head -n 1)"
  if [[ "${active}" == "back_blue" || "${active}" == "back_green" ]]; then
    printf '%s' "${active}"
    return 0
  fi

  return 1
}

container_image_for_service() {
  local service="$1"
  local container_id
  container_id="$(compose ps -q "${service}" 2>/dev/null | head -n 1 || true)"
  if [[ -z "${container_id}" ]]; then
    return 1
  fi

  docker inspect -f '{{.Config.Image}}' "${container_id}" 2>/dev/null | tr -d '\r'
}

enforce_single_backend_rule() {
  local running
  running="$(list_running_backends)"
  local count
  count="$(printf '%s\n' "${running}" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "${count}" == "0" ]]; then
    log "FAIL backend running count=0"
    return 1
  fi

  if [[ "${count}" == "1" ]]; then
    log "OK backend running count=1 ($(printf '%s' "${running}" | head -n 1))"
    return 0
  fi

  local active
  active="$(cat "${STATE_FILE}" 2>/dev/null || true)"
  if [[ "${active}" != "back_blue" && "${active}" != "back_green" ]]; then
    active="$(printf '%s\n' "${running}" | sed '/^$/d' | head -n 1)"
  fi
  if ! printf '%s\n' "${running}" | grep -qx "${active}"; then
    active="$(printf '%s\n' "${running}" | sed '/^$/d' | head -n 1)"
  fi

  while IFS= read -r svc; do
    [[ -z "${svc}" ]] && continue
    if [[ "${svc}" != "${active}" ]]; then
      compose stop "${svc}" >/dev/null || true
      log "action stop inactive backend=${svc}"
    fi
  done <<< "${running}"

  running="$(list_running_backends)"
  count="$(printf '%s\n' "${running}" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [[ "${count}" == "1" ]]; then
    log "OK backend running count repaired=1 ($(printf '%s' "${running}" | head -n 1))"
    return 0
  fi

  log "FAIL backend running count=${count} (expected 1)"
  return 1
}

check_active_backend_image() {
  local expected_image active_backend running_image
  expected_image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -z "${expected_image}" ]]; then
    log "FAIL missing BACK_IMAGE in ${ENV_FILE}"
    return 1
  fi

  if ! active_backend="$(resolve_active_backend)"; then
    log "FAIL active backend unresolved for image drift check"
    return 1
  fi

  running_image="$(container_image_for_service "${active_backend}" || true)"
  if [[ -z "${running_image}" ]]; then
    log "FAIL active backend image inspect failed backend=${active_backend}"
    return 1
  fi

  if [[ "${running_image}" == "${expected_image}" ]]; then
    log "OK backend image active=${active_backend} image=${running_image}"
    return 0
  fi

  log "FAIL backend image drift active=${active_backend} expected=${expected_image} actual=${running_image}"
  return 1
}

ensure_caddy_mount_sync() {
  local host_sha mounted_sha
  host_sha="$(host_caddy_sha256)"
  mounted_sha="$(mounted_caddy_sha256)"
  local has_legacy="false"
  if compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}" >/dev/null 2>&1; then
    has_legacy="true"
  fi

  if [[ -n "${host_sha}" && -n "${mounted_sha}" && "${host_sha}" == "${mounted_sha}" && "${has_legacy}" == "false" ]]; then
    log "OK caddy mount sync sha=${mounted_sha}"
    return 0
  fi

  log "WARN caddy mount drift detected host_sha=${host_sha:-none} mounted_sha=${mounted_sha:-none} legacy_back_active=${has_legacy}; recreating caddy"
  compose up -d --force-recreate caddy >/dev/null || true
  compose exec -T caddy caddy reload --config "${CADDY_CONTAINER_FILE}" >/dev/null || true

  host_sha="$(host_caddy_sha256)"
  mounted_sha="$(mounted_caddy_sha256)"
  has_legacy="false"
  if compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}" >/dev/null 2>&1; then
    has_legacy="true"
  fi

  if [[ -n "${host_sha}" && -n "${mounted_sha}" && "${host_sha}" == "${mounted_sha}" && "${has_legacy}" == "false" ]]; then
    log "OK caddy mount sync repaired sha=${mounted_sha}"
    return 0
  fi

  log "FAIL caddy mount sync host_sha=${host_sha:-none} mounted_sha=${mounted_sha:-none} legacy_back_active=${has_legacy}"
  return 1
}

check_api_readiness() {
  local api_domain
  api_domain="$(env_value "API_DOMAIN")"
  if [[ -z "${api_domain}" ]]; then
    log "FAIL missing API_DOMAIN in ${ENV_FILE}"
    return 1
  fi

  local code
  code="$(
    docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
      --connect-timeout 3 \
      --max-time 8 \
      -s -o /dev/null -w "%{http_code}" \
      "http://caddy:80/actuator/health/readiness" \
      -H "Host: ${api_domain}" || true
  )"

  if [[ "${code}" == "200" ]]; then
    log "OK api readiness status=${code}"
    return 0
  fi

  log "FAIL api readiness status=${code:-none}"
  return 1
}

query_grafana_datasource_by_uid() {
  local grafana_user="$1"
  local grafana_password="$2"
  local datasource_uid="$3"

  local response code
  response="$(
    docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
      --connect-timeout 3 \
      --max-time 8 \
      -sS \
      -u "${grafana_user}:${grafana_password}" \
      -w $'\nHTTP_STATUS:%{http_code}\n' \
      "http://grafana:3000/api/datasources/uid/${datasource_uid}" || true
  )"
  code="$(printf '%s\n' "${response}" | awk -F: '/^HTTP_STATUS:/ {print $2}' | tr -d '\r' | tail -n1)"
  [[ -n "${code}" ]] || code="none"
  printf '%s' "${code}"
  if [[ "${code}" == "200" ]] && printf '%s' "${response}" | grep -q "\"uid\":\"${datasource_uid}\""; then
    return 0
  fi
  return 1
}

check_grafana_core_datasources() {
  local grafana_user grafana_password
  grafana_user="$(env_value "GRAFANA_ADMIN_USER")"
  grafana_password="$(env_value "GRAFANA_ADMIN_PASSWORD")"
  [[ -n "${grafana_user}" ]] || grafana_user="admin"
  [[ -n "${grafana_password}" ]] || grafana_password="change_me_grafana_password"

  local fail_threshold cooldown_seconds
  fail_threshold="$(normalize_positive_int "$(env_value "GRAFANA_DS_FAIL_THRESHOLD")" "3")"
  cooldown_seconds="$(normalize_non_negative_int "$(env_value "GRAFANA_DS_RECREATE_COOLDOWN_SECONDS")" "900")"

  load_grafana_ds_state

  local prometheus_status loki_status
  local prometheus_ok="false"
  local loki_ok="false"

  if prometheus_status="$(query_grafana_datasource_by_uid "${grafana_user}" "${grafana_password}" "prometheus")"; then
    prometheus_ok="true"
  fi
  if loki_status="$(query_grafana_datasource_by_uid "${grafana_user}" "${grafana_password}" "loki")"; then
    loki_ok="true"
  fi

  if [[ "${prometheus_ok}" == "true" && "${loki_ok}" == "true" ]]; then
    if (( GRAFANA_DS_FAIL_COUNT > 0 )); then
      log "OK grafana datasources recovered prometheus=${prometheus_status} loki=${loki_status} consecutive_failures=${GRAFANA_DS_FAIL_COUNT}"
    else
      log "OK grafana datasources uid=prometheus,loki"
    fi
    GRAFANA_DS_FAIL_COUNT=0
    save_grafana_ds_state
    return 0
  fi

  GRAFANA_DS_FAIL_COUNT=$(( GRAFANA_DS_FAIL_COUNT + 1 ))
  save_grafana_ds_state
  log "WARN grafana datasources unhealthy prometheus=${prometheus_status:-none} loki=${loki_status:-none} consecutive_failures=${GRAFANA_DS_FAIL_COUNT} threshold=${fail_threshold}"

  if (( GRAFANA_DS_FAIL_COUNT < fail_threshold )); then
    return 1
  fi

  local now elapsed_since_recreate
  now="$(date +%s)"
  elapsed_since_recreate=$(( now - GRAFANA_DS_LAST_RECREATE_EPOCH ))
  if (( GRAFANA_DS_LAST_RECREATE_EPOCH > 0 && elapsed_since_recreate < cooldown_seconds )); then
    local cooldown_remaining
    cooldown_remaining=$(( cooldown_seconds - elapsed_since_recreate ))
    log "WARN grafana datasource recreate skipped due cooldown remaining_seconds=${cooldown_remaining}"
    return 1
  fi

  log "WARN grafana datasource threshold reached; recreating grafana"
  compose up -d --force-recreate grafana >/dev/null || true
  GRAFANA_DS_LAST_RECREATE_EPOCH="${now}"
  save_grafana_ds_state
  sleep 3

  prometheus_ok="false"
  loki_ok="false"
  if prometheus_status="$(query_grafana_datasource_by_uid "${grafana_user}" "${grafana_password}" "prometheus")"; then
    prometheus_ok="true"
  fi
  if loki_status="$(query_grafana_datasource_by_uid "${grafana_user}" "${grafana_password}" "loki")"; then
    loki_ok="true"
  fi
  if [[ "${prometheus_ok}" == "true" && "${loki_ok}" == "true" ]]; then
    GRAFANA_DS_FAIL_COUNT=0
    save_grafana_ds_state
    log "OK grafana datasources repaired prometheus=${prometheus_status} loki=${loki_status}"
    return 0
  fi

  log "FAIL grafana datasources unhealthy after_recreate=true prometheus=${prometheus_status:-none} loki=${loki_status:-none}"
  return 1
}

check_grafana_embed_route() {
  local api_domain grafana_domain path admin_email admin_password
  api_domain="$(trim_quotes "$(env_value "API_DOMAIN")")"
  grafana_domain="$(trim_quotes "$(env_value "GRAFANA_DOMAIN")")"
  path="$(monitoring_embed_candidate_path)"
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"
  if [[ -z "${grafana_domain}" ]]; then
    log "skip grafana origin route check (no GRAFANA_DOMAIN configured)"
    return 0
  fi
  if [[ -z "${api_domain}" || -z "${admin_email}" || -z "${admin_password}" ]]; then
    log "skip grafana origin route check (missing API_DOMAIN or admin credentials)"
    return 0
  fi

  local fail_threshold cooldown_seconds
  fail_threshold="$(normalize_positive_int "$(env_value "GRAFANA_EMBED_FAIL_THRESHOLD")" "3")"
  cooldown_seconds="$(normalize_non_negative_int "$(env_value "GRAFANA_EMBED_RECREATE_COOLDOWN_SECONDS")" "900")"

  load_grafana_embed_state

  local headers internal_health
  internal_health="$(inspect_grafana_internal_health)"
  headers="$(probe_grafana_embed_origin_headers "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}")"

  if grafana_embed_headers_are_healthy "${headers}" "${internal_health}"; then
    if (( GRAFANA_EMBED_FAIL_COUNT > 0 )); then
      log "OK grafana origin route recovered consecutive_failures=${GRAFANA_EMBED_FAIL_COUNT} host=${grafana_domain} path=${path}"
    else
      log "OK grafana origin route host=${grafana_domain} path=${path}"
    fi
    GRAFANA_EMBED_FAIL_COUNT=0
    save_grafana_embed_state
    return 0
  fi

  GRAFANA_EMBED_FAIL_COUNT=$(( GRAFANA_EMBED_FAIL_COUNT + 1 ))
  save_grafana_embed_state
  log "WARN grafana origin route unhealthy consecutive_failures=${GRAFANA_EMBED_FAIL_COUNT} threshold=${fail_threshold} host=${grafana_domain} path=${path}"

  if (( GRAFANA_EMBED_FAIL_COUNT < fail_threshold )); then
    return 1
  fi

  local now elapsed_since_recreate
  now="$(date +%s)"
  elapsed_since_recreate=$(( now - GRAFANA_EMBED_LAST_RECREATE_EPOCH ))
  if (( GRAFANA_EMBED_LAST_RECREATE_EPOCH > 0 && elapsed_since_recreate < cooldown_seconds )); then
    local cooldown_remaining
    cooldown_remaining=$(( cooldown_seconds - elapsed_since_recreate ))
    log "WARN grafana embed recreate skipped due cooldown remaining_seconds=${cooldown_remaining}"
    return 1
  fi

  log "WARN grafana origin route threshold reached; recreating caddy and grafana"
  compose up -d --force-recreate caddy grafana >/dev/null || true
  GRAFANA_EMBED_LAST_RECREATE_EPOCH="${now}"
  save_grafana_embed_state
  sleep 3

  internal_health="$(inspect_grafana_internal_health)"
  headers="$(probe_grafana_embed_origin_headers "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}")"
  if grafana_embed_headers_are_healthy "${headers}" "${internal_health}"; then
    GRAFANA_EMBED_FAIL_COUNT=0
    save_grafana_embed_state
    log "OK grafana origin route repaired host=${grafana_domain} path=${path}"
    return 0
  fi

  log "FAIL grafana origin route still unhealthy after_recreate=true host=${grafana_domain} path=${path}"
  return 1
}

probe_notification_sse_route() {
  local api_domain="$1"
  local admin_email admin_password
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
    log "skip notification sse route check (missing CUSTOM__ADMIN__EMAIL or CUSTOM__ADMIN__PASSWORD)"
    return 0
  fi

  local probe_output
  probe_output="$(
    docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
      set -eu
      api_domain="$1"
      admin_email="$2"
      admin_password="$3"
      cookie_jar="$(mktemp)"
      trap "rm -f \"${cookie_jar}\"" EXIT
      login_payload="{\"email\":\"${admin_email}\",\"password\":\"${admin_password}\"}"
      login_code="$(
        curl -sS \
          --connect-timeout 3 \
          --max-time 12 \
          -c "${cookie_jar}" \
          -o /dev/null \
          -w "%{http_code}" \
          -H "Host: ${api_domain}" \
          -H "Content-Type: application/json" \
          --data "${login_payload}" \
          "http://caddy:80/member/api/v1/auth/login" || true
      )"
      echo "login_status=${login_code}"
      if ! printf "%s" "${login_code}" | grep -Eq "^2[0-9][0-9]$"; then
        exit 11
      fi

      stream_body="$(
        curl -sS -N \
          --connect-timeout 3 \
          --max-time 35 \
          -b "${cookie_jar}" \
          -H "Host: ${api_domain}" \
          "http://caddy:80/member/api/v1/notifications/stream" || true
      )"
      printf "%s\n" "${stream_body}" | tr -d "\r"
    ' sh "${api_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
  )"

  if [[ "${probe_output}" == *"event: connected"* && "${probe_output}" == *"event: heartbeat"* ]]; then
    return 0
  fi

  printf '%s' "${probe_output}"
  return 1
}

check_notification_sse_route() {
  local api_domain
  api_domain="$(trim_quotes "$(env_value "API_DOMAIN")")"
  if [[ -z "${api_domain}" ]]; then
    log "FAIL missing API_DOMAIN in ${ENV_FILE}"
    return 1
  fi

  local fail_threshold cooldown_seconds
  fail_threshold="$(normalize_positive_int "$(env_value "NOTIFICATION_SSE_FAIL_THRESHOLD")" "2")"
  cooldown_seconds="$(normalize_non_negative_int "$(env_value "NOTIFICATION_SSE_RECREATE_COOLDOWN_SECONDS")" "900")"

  load_notification_sse_state

  local probe_output
  if probe_output="$(probe_notification_sse_route "${api_domain}")"; then
    if (( NOTIFICATION_SSE_FAIL_COUNT > 0 )); then
      log "OK notification sse route recovered consecutive_failures=${NOTIFICATION_SSE_FAIL_COUNT}"
    else
      log "OK notification sse route connected+heartbeat"
    fi
    NOTIFICATION_SSE_FAIL_COUNT=0
    save_notification_sse_state
    return 0
  fi

  NOTIFICATION_SSE_FAIL_COUNT=$(( NOTIFICATION_SSE_FAIL_COUNT + 1 ))
  save_notification_sse_state
  log "WARN notification sse unhealthy consecutive_failures=${NOTIFICATION_SSE_FAIL_COUNT} threshold=${fail_threshold}"

  if (( NOTIFICATION_SSE_FAIL_COUNT < fail_threshold )); then
    log "WARN notification sse probe output: ${probe_output}"
    return 1
  fi

  local now elapsed_since_recreate
  now="$(date +%s)"
  elapsed_since_recreate=$(( now - NOTIFICATION_SSE_LAST_RECREATE_EPOCH ))
  if (( NOTIFICATION_SSE_LAST_RECREATE_EPOCH > 0 && elapsed_since_recreate < cooldown_seconds )); then
    local cooldown_remaining
    cooldown_remaining=$(( cooldown_seconds - elapsed_since_recreate ))
    log "WARN notification sse recreate skipped due cooldown remaining_seconds=${cooldown_remaining}"
    log "WARN notification sse probe output: ${probe_output}"
    return 1
  fi

  log "WARN notification sse threshold reached; recreating caddy"
  compose up -d --force-recreate caddy >/dev/null || true
  compose exec -T caddy caddy reload --config "${CADDY_CONTAINER_FILE}" >/dev/null || true
  NOTIFICATION_SSE_LAST_RECREATE_EPOCH="${now}"
  save_notification_sse_state
  sleep 3

  if probe_output="$(probe_notification_sse_route "${api_domain}")"; then
    NOTIFICATION_SSE_FAIL_COUNT=0
    save_notification_sse_state
    log "OK notification sse repaired connected+heartbeat"
    return 0
  fi

  log "FAIL notification sse route still unhealthy after_recreate=true"
  log "FAIL notification sse probe output: ${probe_output}"
  return 1
}

deploy_lock_is_active() {
  if [[ ! -d "${DEPLOY_LOCK_DIR}" ]]; then
    return 1
  fi

  local lock_mtime now age
  lock_mtime="$(stat -c %Y "${DEPLOY_LOCK_DIR}" 2>/dev/null || true)"
  if [[ ! "${lock_mtime}" =~ ^[0-9]+$ ]]; then
    log "skip: deploy lock detected (mtime unreadable): ${DEPLOY_LOCK_DIR}"
    return 0
  fi

  now="$(date +%s)"
  age=$(( now - lock_mtime ))
  if (( age <= DEPLOY_LOCK_TTL_SECONDS )); then
    log "skip: deploy lock detected: ${DEPLOY_LOCK_DIR} age_seconds=${age}"
    return 0
  fi

  log "WARN stale deploy lock detected; removing ${DEPLOY_LOCK_DIR} age_seconds=${age}"
  rm -rf "${DEPLOY_LOCK_DIR}" 2>/dev/null || true
  return 1
}

main() {
  if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
    log "skip: previous guard still running"
    exit 0
  fi
  trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

  if deploy_lock_is_active; then
    exit 0
  fi

  local ok=0
  if enforce_single_backend_rule; then ok=$((ok + 1)); fi
  if check_active_backend_image; then ok=$((ok + 1)); fi
  if ensure_caddy_mount_sync; then ok=$((ok + 1)); fi
  if check_api_readiness; then ok=$((ok + 1)); fi
  if check_grafana_core_datasources; then ok=$((ok + 1)); fi
  if check_grafana_embed_route; then ok=$((ok + 1)); fi
  if check_notification_sse_route; then ok=$((ok + 1)); fi

  if [[ "${ok}" -ne 7 ]]; then
    compose logs --no-color --tail=80 caddy grafana loki promtail >&2 || true
    exit 1
  fi
}

main "$@"
