#!/usr/bin/env bash

set -euo pipefail

# Prevent child commands from consuming the parent ssh heredoc stdin.
exec </dev/null

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
RELEASE_STATE_FILE="${SCRIPT_DIR}/.backend-release-state.env"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-blog_home}"
NETWORK_NAME="blog_home_default"
DEPLOY_LOCK_DIR="${SCRIPT_DIR}/.deploy.lock"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/actuator/health/readiness}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-120}"
CANDIDATE_HEALTHCHECK_RETRIES="${CANDIDATE_HEALTHCHECK_RETRIES:-450}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_MAX_TIME_SECONDS="${HEALTHCHECK_MAX_TIME_SECONDS:-5}"
HEALTHCHECK_LOG_EVERY_N_TRIES="${HEALTHCHECK_LOG_EVERY_N_TRIES:-5}"
PREWARM_ENABLED="${PREWARM_ENABLED:-true}"
PREWARM_CONNECT_TIMEOUT_SECONDS="${PREWARM_CONNECT_TIMEOUT_SECONDS:-2}"
PREWARM_MAX_TIME_SECONDS="${PREWARM_MAX_TIME_SECONDS:-6}"
PREWARM_RETRIES="${PREWARM_RETRIES:-2}"
PREWARM_BACKOFF_SECONDS="${PREWARM_BACKOFF_SECONDS:-1}"
PREWARM_PUBLIC_ROUTE_POST_LIMIT="${PREWARM_PUBLIC_ROUTE_POST_LIMIT:-5}"
STREAM_DRAIN_SECONDS="${STREAM_DRAIN_SECONDS:-15}"
BLUE_GREEN_BURN_IN_PROFILE="${BLUE_GREEN_BURN_IN_PROFILE:-standard}"
BLUE_GREEN_BURN_IN_SECONDS="${BLUE_GREEN_BURN_IN_SECONDS:-}"
BLUE_GREEN_BURN_IN_STANDARD_SECONDS="${BLUE_GREEN_BURN_IN_STANDARD_SECONDS:-180}"
BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS="${BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS:-600}"
BLUE_GREEN_BURN_IN_PROBE_INTERVAL_SECONDS="${BLUE_GREEN_BURN_IN_PROBE_INTERVAL_SECONDS:-15}"
RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED:-false}"
RUNTIME_SPLIT_STAGE="${RUNTIME_SPLIT_STAGE:-A}"
AUTO_MEMORY_TUNER_ENABLED="${AUTO_MEMORY_TUNER_ENABLED:-true}"
AUTO_MEMORY_TUNER_MAX_BUDGET_MB="${AUTO_MEMORY_TUNER_MAX_BUDGET_MB:-4096}"
AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB="${AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB:-2048}"
AUTO_MEMORY_TUNER_MIN_BUDGET_MB="${AUTO_MEMORY_TUNER_MIN_BUDGET_MB:-1280}"
LAST_COMPOSE_UP_SERVICES=""
LAST_COMPOSE_UP_OUTPUT=""
AUTOHEAL_PAUSED="false"

run_diagnostic_command() {
  local timeout_seconds="${DIAGNOSTIC_TIMEOUT_SECONDS:-15}"
  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground "${timeout_seconds}" "$@"
    return
  fi
  "$@"
}

run_compose_diagnostic() {
  local timeout_seconds="${DIAGNOSTIC_TIMEOUT_SECONDS:-15}"
  local profiles
  profiles="$(resolve_compose_profiles)"

  if command -v timeout >/dev/null 2>&1; then
    if [[ -n "${profiles}" ]]; then
      COMPOSE_PROFILES="${profiles}" timeout --foreground "${timeout_seconds}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
      return
    fi
    timeout --foreground "${timeout_seconds}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
    return
  fi

  if [[ -n "${profiles}" ]]; then
    COMPOSE_PROFILES="${profiles}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
    return
  fi
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

normalize_bool() {
  local raw="$1"
  case "$(echo "${raw}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

normalize_runtime_split_stage() {
  local raw="$1"
  case "$(echo "${raw}" | tr '[:lower:]' '[:upper:]')" in
    B) echo "B" ;;
    *) echo "A" ;;
  esac
}

normalize_positive_int() {
  local raw="$1"
  local fallback="$2"
  if [[ "${raw}" =~ ^[0-9]+$ ]] && (( raw > 0 )); then
    echo "${raw}"
    return
  fi
  echo "${fallback}"
}

normalize_non_negative_int() {
  local raw="$1"
  local fallback="$2"
  if [[ "${raw}" =~ ^[0-9]+$ ]]; then
    echo "${raw}"
    return
  fi
  echo "${fallback}"
}

RUNTIME_SPLIT_ENABLED="$(normalize_bool "${RUNTIME_SPLIT_ENABLED}")"
RUNTIME_SPLIT_STAGE="$(normalize_runtime_split_stage "${RUNTIME_SPLIT_STAGE}")"
HEALTHCHECK_RETRIES="$(normalize_positive_int "${HEALTHCHECK_RETRIES}" "120")"
CANDIDATE_HEALTHCHECK_RETRIES="$(normalize_positive_int "${CANDIDATE_HEALTHCHECK_RETRIES}" "450")"
STREAM_DRAIN_SECONDS="$(normalize_non_negative_int "${STREAM_DRAIN_SECONDS}" "15")"
BLUE_GREEN_BURN_IN_STANDARD_SECONDS="$(normalize_non_negative_int "${BLUE_GREEN_BURN_IN_STANDARD_SECONDS}" "180")"
BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS="$(normalize_non_negative_int "${BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS}" "600")"
BLUE_GREEN_BURN_IN_PROBE_INTERVAL_SECONDS="$(normalize_positive_int "${BLUE_GREEN_BURN_IN_PROBE_INTERVAL_SECONDS}" "15")"
AUTO_MEMORY_TUNER_ENABLED="$(normalize_bool "${AUTO_MEMORY_TUNER_ENABLED}")"
AUTO_MEMORY_TUNER_MAX_BUDGET_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_MAX_BUDGET_MB}" "4096")"
AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB}" "2048")"
AUTO_MEMORY_TUNER_MIN_BUDGET_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_MIN_BUDGET_MB}" "1280")"

resolve_compose_profiles() {
  local profiles="${COMPOSE_PROFILES:-}"
  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    echo "${profiles}"
    return
  fi

  if [[ -z "${profiles}" ]]; then
    echo "runtime-split"
    return
  fi

  if [[ ",${profiles}," == *",runtime-split,"* ]]; then
    echo "${profiles}"
    return
  fi

  echo "${profiles},runtime-split"
}

compose() {
  local profiles
  profiles="$(resolve_compose_profiles)"
  if [[ -n "${profiles}" ]]; then
    COMPOSE_PROFILES="${profiles}" docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
    return
  fi
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

acquire_deploy_lock() {
  if mkdir "${DEPLOY_LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" > "${DEPLOY_LOCK_DIR}/pid" 2>/dev/null || true
    return 0
  fi
  local lock_pid
  lock_pid="$(cat "${DEPLOY_LOCK_DIR}/pid" 2>/dev/null || true)"
  if [[ "${lock_pid}" =~ ^[0-9]+$ ]] && ! kill -0 "${lock_pid}" 2>/dev/null; then
    echo "removing stale deploy lock: ${DEPLOY_LOCK_DIR} pid=${lock_pid}" >&2
    rm -rf "${DEPLOY_LOCK_DIR}" 2>/dev/null || true
    if mkdir "${DEPLOY_LOCK_DIR}" 2>/dev/null; then
      printf '%s\n' "$$" > "${DEPLOY_LOCK_DIR}/pid" 2>/dev/null || true
      return 0
    fi
  fi
  echo "deploy lock already exists: ${DEPLOY_LOCK_DIR} pid=${lock_pid:-unknown}" >&2
  return 1
}

release_deploy_lock() {
  rm -rf "${DEPLOY_LOCK_DIR}" 2>/dev/null || true
}

is_compose_service_running() {
  local service="$1"
  compose ps --status running --services 2>/dev/null | grep -qx "${service}"
}

pause_autoheal_for_blue_green() {
  if ! is_compose_service_running "autoheal"; then
    echo "autoheal is not running; skip blue/green autoheal pause"
    return 0
  fi

  echo "pausing autoheal during blue/green candidate readiness"
  compose stop autoheal
  AUTOHEAL_PAUSED="true"
}

resume_autoheal_if_paused() {
  if [[ "${AUTOHEAL_PAUSED}" != "true" ]]; then
    return 0
  fi

  echo "resuming autoheal after blue/green candidate readiness"
  compose up -d autoheal || true
  AUTOHEAL_PAUSED="false"
}

require_supported_docker_engine() {
  local version
  version="$(docker version --format '{{.Server.Version}}' 2>/dev/null | tr -d '\r' || true)"
  if [[ -z "${version}" ]]; then
    echo "failed to detect docker engine version" >&2
    exit 1
  fi
  if [[ "${version}" =~ ^29\.1\.0([.-]|$) ]]; then
    echo "unsupported docker engine version detected: ${version}" >&2
    echo "known regression in 29.1.0 can break caddy/backend networking. downgrade or upgrade engine first." >&2
    exit 1
  fi
  echo "docker engine version ok: ${version}"
}

compose_up_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  LAST_COMPOSE_UP_SERVICES="$*"
  LAST_COMPOSE_UP_OUTPUT=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d "$@" 2>&1)"; then
      LAST_COMPOSE_UP_OUTPUT="${output}"
      echo "${output}"
      return 0
    fi

    LAST_COMPOSE_UP_OUTPUT="${output}"

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

compose_up_force_recreate_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  LAST_COMPOSE_UP_SERVICES="$*"
  LAST_COMPOSE_UP_OUTPUT=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d --force-recreate "$@" 2>&1)"; then
      LAST_COMPOSE_UP_OUTPUT="${output}"
      echo "${output}"
      return 0
    fi

    LAST_COMPOSE_UP_OUTPUT="${output}"

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up --force-recreate retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up --force-recreate failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

compose_up_no_deps_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d --no-deps "$@" 2>&1)"; then
      echo "${output}"
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up --no-deps retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up --no-deps failed after ${max_attempts} retries for services [$*]" >&2
  echo "${output}" >&2
  return 1
}

backend_container_id_any_state() {
  local backend="$1"
  docker ps -aq \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=${backend}" | head -n 1
}

emit_backend_diagnostics() {
  local backend="$1"
  local cid
  cid="$(backend_container_id_any_state "${backend}")"

  echo "----- ${backend} diagnostics -----"
  run_compose_diagnostic ps -a "${backend}" || true
  if [[ -n "${cid}" ]]; then
    run_diagnostic_command docker inspect --format "${backend} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}" "${cid}" || true
  else
    echo "${backend} container=none"
  fi

  if [[ -n "${LAST_COMPOSE_UP_SERVICES}" && ",${LAST_COMPOSE_UP_SERVICES// /,}," == *",${backend},"* ]]; then
    echo "[compose-up-output:${backend}]"
    printf '%s\n' "${LAST_COMPOSE_UP_OUTPUT}"
  fi

  run_compose_diagnostic logs --no-color --tail=200 "${backend}" || true
  echo "----- end ${backend} diagnostics -----"
}

cloudflared_registration_log_exists() {
  local logs="$1"
  if echo "${logs}" | grep -Eqi 'Registered tunnel connection|Connection .* registered'; then
    return 0
  fi
  return 1
}

probe_cloudflared_public_readiness_code() {
  local api_domain="$1"
  local connect_timeout="${CLOUDFLARED_PUBLIC_CONNECT_TIMEOUT_SECONDS:-5}"
  local max_time="${CLOUDFLARED_PUBLIC_MAX_TIME_SECONDS:-15}"
  if [[ -z "${api_domain}" ]]; then
    echo ""
    return 0
  fi

  curl -sS \
    --connect-timeout "${connect_timeout}" \
    -m "${max_time}" \
    -o /dev/null \
    -w "%{http_code}" \
    "https://${api_domain}${HEALTHCHECK_PATH}" || true
}

check_cloudflared_public_readiness() {
  local api_domain="$1"
  local retries="${CLOUDFLARED_PUBLIC_READINESS_RETRIES:-5}"
  local sleep_seconds="${CLOUDFLARED_PUBLIC_READINESS_SLEEP_SECONDS:-2}"
  local attempt=1
  local code

  if [[ -z "${api_domain}" ]]; then
    echo "skip cloudflared public readiness: API_DOMAIN is empty"
    return 0
  fi

  while [[ "${attempt}" -le "${retries}" ]]; do
    code="$(probe_cloudflared_public_readiness_code "${api_domain}")"
    if is_healthy_http_code "${code}"; then
      echo "cloudflared public readiness ok: domain=${api_domain} status=${code} attempt=${attempt}/${retries}"
      return 0
    fi

    echo "cloudflared public readiness pending: domain=${api_domain} status=${code:-none} attempt=${attempt}/${retries}" >&2
    sleep "${sleep_seconds}"
    attempt=$((attempt + 1))
  done

  echo "cloudflared public readiness failed: domain=${api_domain} status=${code:-none} attempts=${retries}" >&2
  return 1
}

check_cloudflared_runtime() {
  local api_domain="${1:-}"
  local cid
  cid="$(compose ps -q cloudflared | head -n 1)"
  if [[ -z "${cid}" ]]; then
    echo "cloudflared container is missing" >&2
    return 1
  fi

  local status restarting restart_count
  status="$(docker inspect --format '{{.State.Status}}' "${cid}" 2>/dev/null || echo "unknown")"
  restarting="$(docker inspect --format '{{.State.Restarting}}' "${cid}" 2>/dev/null || echo "unknown")"
  restart_count="$(docker inspect --format '{{.RestartCount}}' "${cid}" 2>/dev/null || echo "0")"

  if [[ "${status}" != "running" || "${restarting}" == "true" ]]; then
    echo "cloudflared is not healthy: status=${status}, restarting=${restarting}" >&2
    run_compose_diagnostic logs --no-color --tail=120 cloudflared >&2 || true
    return 1
  fi

  if [[ "${restart_count}" =~ ^[0-9]+$ ]] && (( restart_count > 5 )); then
    echo "cloudflared restart count is too high: ${restart_count}" >&2
    run_compose_diagnostic logs --no-color --tail=120 cloudflared >&2 || true
    return 1
  fi

  local cf_logs
  cf_logs="$(run_compose_diagnostic logs --no-color --tail=240 cloudflared || true)"
  local has_registration_log="false"
  if cloudflared_registration_log_exists "${cf_logs}"; then
    has_registration_log="true"
  fi

  if [[ "${has_registration_log}" != "true" ]]; then
    echo "WARN cloudflared registration log missing in recent tail; verifying public readiness before restart" >&2
    if check_cloudflared_public_readiness "${api_domain}"; then
      echo "cloudflared runtime check ok: status=${status}, restart_count=${restart_count}, registration=missing_recent_tail"
      return 0
    fi

    echo "cloudflared public readiness failed; restarting cloudflared once" >&2
    compose restart cloudflared >/dev/null || true
    sleep 2

    status="$(docker inspect --format '{{.State.Status}}' "${cid}" 2>/dev/null || echo "unknown")"
    restarting="$(docker inspect --format '{{.State.Restarting}}' "${cid}" 2>/dev/null || echo "unknown")"
    restart_count="$(docker inspect --format '{{.RestartCount}}' "${cid}" 2>/dev/null || echo "0")"
    if [[ "${status}" != "running" || "${restarting}" == "true" ]]; then
      echo "cloudflared is not healthy after restart: status=${status}, restarting=${restarting}" >&2
      run_compose_diagnostic logs --no-color --tail=120 cloudflared >&2 || true
      return 1
    fi

    cf_logs="$(run_compose_diagnostic logs --no-color --tail=320 cloudflared || true)"
    if cloudflared_registration_log_exists "${cf_logs}"; then
      has_registration_log="true"
    fi

    if ! check_cloudflared_public_readiness "${api_domain}"; then
      echo "cloudflared runtime verify failed after restart" >&2
      echo "${cf_logs}" >&2
      return 1
    fi
  fi

  echo "cloudflared runtime check ok: status=${status}, restart_count=${restart_count}, registration=${has_registration_log}"
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
  echo "${value}"
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
  echo "${url}"
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

probe_grafana_embed_headers() {
  local url="$1"
  curl -s --connect-timeout 3 --max-time 10 -D - -o /dev/null "${url}" 2>/dev/null || true
}

probe_grafana_internal_health() {
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://grafana:3000/api/health" 2>/dev/null || true
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
    curl -s \
      --connect-timeout 3 \
      --max-time 12 \
      -D - \
      -o /dev/null \
      -b "${cookie_jar}" \
      -H "Host: ${grafana_domain}" \
      "http://caddy:80${path}" || true
  ' sh "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}" 2>/dev/null || true
}

check_grafana_embed_origin_route() {
  local api_domain grafana_domain path admin_email admin_password
  api_domain="$(trim_quotes "$(env_value "API_DOMAIN")")"
  grafana_domain="$(trim_quotes "$(env_value "GRAFANA_DOMAIN")")"
  path="$(monitoring_embed_candidate_path)"
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${grafana_domain}" ]]; then
    echo "skip grafana origin route check: no GRAFANA_DOMAIN configured"
    return 0
  fi
  if [[ -z "${api_domain}" || -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "skip grafana origin route check: missing API_DOMAIN or admin credentials"
    return 0
  fi

  local attempts=20
  local sleep_seconds=3
  local try=1
  local headers status location xfo csp internal_health

  while (( try <= attempts )); do
    internal_health="$(probe_grafana_internal_health)"
    headers="$(probe_grafana_embed_origin_headers "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}")"
    status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
    location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
    xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
    csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"

    if [[ "${internal_health}" == "200" ]] &&
      [[ "${status}" == "200" || "${status}" == "401" || "${status}" == "403" ]] &&
      [[ "${location}" != *"/login"* ]] &&
      [[ -z "${xfo}" || ! "${xfo}" =~ [Dd][Ee][Nn][Yy]|[Ss][Aa][Mm][Ee][Oo][Rr][Ii][Gg][Ii][Nn] ]]; then
      if [[ -z "${csp}" || "${csp}" != *"frame-ancestors"* || "${csp}" == *"aquilaxk.site"* || "${csp}" == *"*"* ]]; then
        if [[ "${status}" == "200" ]]; then
          echo "grafana origin auth-proxy route ok: status=${status} grafana_health=${internal_health} host=${grafana_domain} path=${path}"
        else
          echo "grafana origin auth-proxy route ok(protected): status=${status} grafana_health=${internal_health} host=${grafana_domain} path=${path}"
        fi
        return 0
      fi
    fi

    if (( try % 5 == 0 )); then
      echo "waiting grafana origin auth-proxy route (${try}/${attempts}) status=${status:-none} grafana_health=${internal_health:-none} location=${location:-none} x-frame-options=${xfo:-none}" >&2
    fi
    sleep "${sleep_seconds}"
    try=$((try + 1))
  done

  echo "grafana origin auth-proxy route check failed: host=${grafana_domain} path=${path} status=${status:-none} grafana_health=${internal_health:-none} location=${location:-none} x-frame-options=${xfo:-none}" >&2
  if [[ -n "${csp}" ]]; then
    echo "grafana embed csp=${csp}" >&2
  fi
  return 1
}

warn_grafana_embed_origin_route() {
  check_grafana_embed_origin_route && return 0
  echo "WARN grafana origin auth-proxy route unhealthy; backend deploy continues" >&2
  return 0
}

warn_grafana_embed_public_route() {
  local url
  url="$(monitoring_embed_candidate_url)"
  if [[ -z "${url}" ]] || ! is_grafana_embed_url "${url}"; then
    echo "skip grafana public route warning: no grafana monitoring embed url configured"
    return 0
  fi

  local headers status location xfo csp internal_health
  internal_health="$(probe_grafana_internal_health)"
  headers="$(probe_grafana_embed_headers "${url}")"
  status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
  location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
  xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
  csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"

  if [[ "${internal_health}" == "200" ]] &&
    [[ "${status}" == "200" || "${status}" == "401" || "${status}" == "403" ]] &&
    [[ "${location}" != *"/login"* ]] &&
    [[ -z "${xfo}" || ! "${xfo}" =~ [Dd][Ee][Nn][Yy]|[Ss][Aa][Mm][Ee][Oo][Rr][Ii][Gg][Ii][Nn] ]] &&
    [[ -z "${csp}" || "${csp}" != *"frame-ancestors"* || "${csp}" == *"aquilaxk.site"* || "${csp}" == *"*"* ]]; then
    echo "grafana public embed route ok: status=${status} grafana_health=${internal_health} url=${url}"
    return 0
  fi

  echo "WARN grafana public embed route unhealthy: url=${url} status=${status:-none} grafana_health=${internal_health:-none} location=${location:-none} x-frame-options=${xfo:-none}" >&2
  if [[ -n "${csp}" ]]; then
    echo "WARN grafana public embed csp=${csp}" >&2
  fi
  return 0
}

upsert_env_key() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    grep -vE "^${key}=" "${ENV_FILE}" > "${ENV_FILE}.tmp"
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

configure_runtime_split_env() {
  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    echo "runtime-split disabled: blue/green all-in-one mode"
    return 0
  fi

  local split_api_mode="all"
  if [[ "${RUNTIME_SPLIT_STAGE}" == "B" ]]; then
    split_api_mode="admin"
  fi

  upsert_env_key "READ_API_UPSTREAM" "back_read"
  upsert_env_key "ADMIN_API_UPSTREAM" "back_admin"
  upsert_env_key "CUSTOM__RUNTIME__API_MODE_BLUE" "${split_api_mode}"
  upsert_env_key "CUSTOM__RUNTIME__API_MODE_GREEN" "${split_api_mode}"
  upsert_env_key "CUSTOM__RUNTIME__API_MODE_WORKER" "all"

  echo "runtime-split enabled: stage=${RUNTIME_SPLIT_STAGE}, blue/green apiMode=${split_api_mode}, read/admin upstream fixed"
}

read_host_mem_total_mb() {
  awk '/MemTotal:/ {printf "%d", $2 / 1024; exit}' /proc/meminfo 2>/dev/null || true
}

round_to_step_mb() {
  local value="$1"
  local step="${2:-64}"
  echo $(( ((value + (step / 2)) / step) * step ))
}

reservation_half_mb() {
  local limit_mb="$1"
  local floor_mb="$2"
  local value=$(( limit_mb / 2 ))
  value=$(( (value / 64) * 64 ))
  if (( value < floor_mb )); then
    value="${floor_mb}"
  fi
  if (( value > limit_mb )); then
    value="${limit_mb}"
  fi
  echo "${value}"
}

reservation_ratio_mb() {
  local limit_mb="$1"
  local numerator="$2"
  local denominator="$3"
  local floor_mb="$4"
  local value=$(( (limit_mb * numerator) / denominator ))
  value=$(( (value / 64) * 64 ))
  if (( value < floor_mb )); then
    value="${floor_mb}"
  fi
  if (( value > limit_mb )); then
    value="${limit_mb}"
  fi
  echo "${value}"
}

scaled_limit_mb() {
  local base_mb="$1"
  local budget_mb="$2"
  local base_total_mb="$3"
  local minimum_mb="$4"
  local value=$(( (base_mb * budget_mb + (base_total_mb / 2)) / base_total_mb ))
  value="$(round_to_step_mb "${value}" "64")"
  if (( value < minimum_mb )); then
    value="${minimum_mb}"
  fi
  echo "${value}"
}

allocate_runtime_split_memory_limits() {
  local budget_mb="$1"
  local blue_min=640
  local read_min=512
  local admin_min=512
  local worker_min=512
  local blue
  local read
  local admin
  local worker
  local total

  # 2816 is the original runtime-split scaling reference; the active cap is AUTO_MEMORY_TUNER_MAX_BUDGET_MB.
  blue="$(scaled_limit_mb 512 "${budget_mb}" 2816 "${blue_min}")"
  read="$(scaled_limit_mb 640 "${budget_mb}" 2816 "${read_min}")"
  admin="$(scaled_limit_mb 512 "${budget_mb}" 2816 "${admin_min}")"
  worker="$(scaled_limit_mb 768 "${budget_mb}" 2816 "${worker_min}")"

  total=$(( (blue * 2) + read + admin + worker ))
  while (( total > budget_mb )); do
    if (( blue > blue_min )); then
      blue=$(( blue - 64 ))
      total=$(( total - 128 ))
      continue
    fi
    if (( worker > worker_min )); then
      worker=$(( worker - 64 ))
      total=$(( total - 64 ))
      continue
    fi
    if (( read > read_min )); then
      read=$(( read - 64 ))
      total=$(( total - 64 ))
      continue
    fi
    if (( admin > admin_min )); then
      admin=$(( admin - 64 ))
      total=$(( total - 64 ))
      continue
    fi
    break
  done

  if (( total > budget_mb )); then
    return 1
  fi

  AUTO_TUNED_BACK_MEM_LIMIT_MB="${blue}"
  AUTO_TUNED_BACK_READ_MEM_LIMIT_MB="${read}"
  AUTO_TUNED_BACK_ADMIN_MEM_LIMIT_MB="${admin}"
  AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB="${worker}"
  AUTO_TUNED_BACK_MEM_RESERVATION_MB="$(reservation_half_mb "${blue}" 192)"
  AUTO_TUNED_BACK_READ_MEM_RESERVATION_MB="$(reservation_half_mb "${read}" 256)"
  AUTO_TUNED_BACK_ADMIN_MEM_RESERVATION_MB="$(reservation_half_mb "${admin}" 256)"
  AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB="$(reservation_ratio_mb "${worker}" 3 4 384)"

  return 0
}

allocate_single_runtime_memory_limits() {
  local budget_mb="$1"
  local blue_min=384
  local worker_min=512
  local blue
  local worker
  local total

  blue="$(scaled_limit_mb 512 "${budget_mb}" 1792 "${blue_min}")"
  worker="$(scaled_limit_mb 768 "${budget_mb}" 1792 "${worker_min}")"

  total=$(( (blue * 2) + worker ))
  while (( total > budget_mb )); do
    if (( blue > blue_min )); then
      blue=$(( blue - 64 ))
      total=$(( total - 128 ))
      continue
    fi
    if (( worker > worker_min )); then
      worker=$(( worker - 64 ))
      total=$(( total - 64 ))
      continue
    fi
    break
  done

  if (( total > budget_mb )); then
    return 1
  fi

  AUTO_TUNED_BACK_MEM_LIMIT_MB="${blue}"
  AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB="${worker}"
  AUTO_TUNED_BACK_MEM_RESERVATION_MB="$(reservation_half_mb "${blue}" 192)"
  AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB="$(reservation_ratio_mb "${worker}" 3 4 384)"

  return 0
}

apply_auto_memory_tuner() {
  if [[ "${AUTO_MEMORY_TUNER_ENABLED}" != "true" ]]; then
    echo "auto-memory-tuner disabled"
    return 0
  fi

  local mode="single-runtime"
  local mode_min_budget_mb=1280
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    mode="runtime-split"
    mode_min_budget_mb=3200
  fi

  if (( AUTO_MEMORY_TUNER_MAX_BUDGET_MB < mode_min_budget_mb )); then
    echo "auto-memory-tuner guard: skip (max_budget_mb=${AUTO_MEMORY_TUNER_MAX_BUDGET_MB} < mode_min_budget_mb=${mode_min_budget_mb})" >&2
    return 0
  fi

  local host_total_mb
  host_total_mb="$(read_host_mem_total_mb)"
  if [[ -z "${host_total_mb}" || ! "${host_total_mb}" =~ ^[0-9]+$ ]]; then
    echo "auto-memory-tuner guard: skip (cannot read host memory)" >&2
    return 0
  fi

  local available_budget_mb=$(( host_total_mb - AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB ))
  if (( available_budget_mb < mode_min_budget_mb )); then
    echo "auto-memory-tuner guard: skip (host_total_mb=${host_total_mb}, system_reserve_mb=${AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB}, available_budget_mb=${available_budget_mb}, required_min_mb=${mode_min_budget_mb})" >&2
    return 0
  fi

  local target_budget_mb="${available_budget_mb}"
  if (( target_budget_mb > AUTO_MEMORY_TUNER_MAX_BUDGET_MB )); then
    target_budget_mb="${AUTO_MEMORY_TUNER_MAX_BUDGET_MB}"
  fi

  local floor_budget_mb="${AUTO_MEMORY_TUNER_MIN_BUDGET_MB}"
  if (( floor_budget_mb < mode_min_budget_mb )); then
    floor_budget_mb="${mode_min_budget_mb}"
  fi
  if (( target_budget_mb < floor_budget_mb )); then
    target_budget_mb="${floor_budget_mb}"
  fi
  if (( target_budget_mb > AUTO_MEMORY_TUNER_MAX_BUDGET_MB )); then
    target_budget_mb="${AUTO_MEMORY_TUNER_MAX_BUDGET_MB}"
  fi

  if (( target_budget_mb < mode_min_budget_mb )); then
    echo "auto-memory-tuner guard: skip (effective target_budget_mb=${target_budget_mb} < mode_min_budget_mb=${mode_min_budget_mb})" >&2
    return 0
  fi

  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    if ! allocate_runtime_split_memory_limits "${target_budget_mb}"; then
      echo "auto-memory-tuner guard: split allocation failed (target_budget_mb=${target_budget_mb})" >&2
      return 0
    fi

    upsert_env_key "BACK_MEM_LIMIT" "${AUTO_TUNED_BACK_MEM_LIMIT_MB}m"
    upsert_env_key "BACK_MEM_RESERVATION" "${AUTO_TUNED_BACK_MEM_RESERVATION_MB}m"
    upsert_env_key "BACK_READ_MEM_LIMIT" "${AUTO_TUNED_BACK_READ_MEM_LIMIT_MB}m"
    upsert_env_key "BACK_READ_MEM_RESERVATION" "${AUTO_TUNED_BACK_READ_MEM_RESERVATION_MB}m"
    upsert_env_key "BACK_ADMIN_MEM_LIMIT" "${AUTO_TUNED_BACK_ADMIN_MEM_LIMIT_MB}m"
    upsert_env_key "BACK_ADMIN_MEM_RESERVATION" "${AUTO_TUNED_BACK_ADMIN_MEM_RESERVATION_MB}m"
    upsert_env_key "BACK_WORKER_MEM_LIMIT" "${AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB}m"
    upsert_env_key "BACK_WORKER_MEM_RESERVATION" "${AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB}m"
    echo "auto-memory-tuner applied: mode=${mode} stage=${RUNTIME_SPLIT_STAGE} host_total_mb=${host_total_mb} budget_mb=${target_budget_mb} back=${AUTO_TUNED_BACK_MEM_LIMIT_MB}/${AUTO_TUNED_BACK_MEM_RESERVATION_MB} read=${AUTO_TUNED_BACK_READ_MEM_LIMIT_MB}/${AUTO_TUNED_BACK_READ_MEM_RESERVATION_MB} admin=${AUTO_TUNED_BACK_ADMIN_MEM_LIMIT_MB}/${AUTO_TUNED_BACK_ADMIN_MEM_RESERVATION_MB} worker=${AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB}/${AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB}"
    return 0
  fi

  if ! allocate_single_runtime_memory_limits "${target_budget_mb}"; then
    echo "auto-memory-tuner guard: single allocation failed (target_budget_mb=${target_budget_mb})" >&2
    return 0
  fi

  upsert_env_key "BACK_MEM_LIMIT" "${AUTO_TUNED_BACK_MEM_LIMIT_MB}m"
  upsert_env_key "BACK_MEM_RESERVATION" "${AUTO_TUNED_BACK_MEM_RESERVATION_MB}m"
  upsert_env_key "BACK_WORKER_MEM_LIMIT" "${AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB}m"
  upsert_env_key "BACK_WORKER_MEM_RESERVATION" "${AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB}m"
  echo "auto-memory-tuner applied: mode=${mode} host_total_mb=${host_total_mb} budget_mb=${target_budget_mb} back=${AUTO_TUNED_BACK_MEM_LIMIT_MB}/${AUTO_TUNED_BACK_MEM_RESERVATION_MB} worker=${AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB}/${AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB}"
}

resolve_local_repo_digest() {
  local image_ref="$1"
  docker image inspect --format '{{index .RepoDigests 0}}' "${image_ref}" 2>/dev/null | head -n 1 | tr -d '\r'
}

ensure_image_env_key_from_local_digest() {
  local key="$1"
  local fallback_image="$2"
  local value
  value="$(trim_quotes "$(env_value "${key}")")"
  if [[ -n "${value}" ]]; then
    return 0
  fi

  local digest
  digest="$(resolve_local_repo_digest "${fallback_image}" || true)"
  if [[ -n "${digest}" ]]; then
    upsert_env_key "${key}" "${digest}"
    echo "auto-filled ${key} from local digest (${fallback_image} -> ${digest})"
    return 0
  fi

  echo "required image env key is missing and local digest lookup failed: ${key} (fallback=${fallback_image})" >&2
  return 1
}

require_digest_image_value() {
  local key="$1"
  local value="$2"

  if [[ -z "${value}" ]]; then
    echo "required image value is missing: ${key}" >&2
    return 1
  fi
  if [[ "${value}" == *":latest" || "${value}" == *":latest@"* ]]; then
    echo "latest tag is not allowed for ${key}: ${value}" >&2
    return 1
  fi
  if [[ ! "${value}" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]; then
    echo "image must be pinned by sha256 digest for ${key}: ${value}" >&2
    return 1
  fi
}

require_back_image() {
  local env_file_back_image
  env_file_back_image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -n "${STAGED_BACK_IMAGE:-}" ]]; then
    BACK_IMAGE="${STAGED_BACK_IMAGE}"
  elif [[ -n "${BACK_IMAGE:-}" ]]; then
    BACK_IMAGE="${BACK_IMAGE}"
  elif [[ -n "${env_file_back_image}" ]]; then
    echo "legacy BACK_IMAGE detected in ${ENV_FILE}; using it as staged deploy image" >&2
    BACK_IMAGE="${env_file_back_image}"
  fi

  if [[ -z "${BACK_IMAGE:-}" ]]; then
    echo "STAGED_BACK_IMAGE is empty. refusing deploy to avoid accidental latest-image rollout." >&2
    echo "set STAGED_BACK_IMAGE=ghcr.io/aquilaxk/aquila-blog-back@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" >&2
    exit 1
  fi

  if ! require_digest_image_value "STAGED_BACK_IMAGE" "${BACK_IMAGE}"; then
    echo "set STAGED_BACK_IMAGE=ghcr.io/aquilaxk/aquila-blog-back@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" >&2
    exit 1
  fi

  STAGED_BACK_IMAGE="${BACK_IMAGE}"
  export STAGED_BACK_IMAGE
}

backend_image_key() {
  local service="$1"
  case "${service}" in
    back_blue) echo "BACK_BLUE_IMAGE" ;;
    back_green) echo "BACK_GREEN_IMAGE" ;;
    back_read) echo "BACK_READ_IMAGE" ;;
    back_admin) echo "BACK_ADMIN_IMAGE" ;;
    back_worker) echo "BACK_WORKER_IMAGE" ;;
    *)
      echo "unknown backend runtime service: ${service}" >&2
      return 1
      ;;
  esac
}

container_image_for_service_any_state() {
  local service="$1"
  local container_id
  container_id="$(
    docker ps -aq \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=${service}" 2>/dev/null | head -n 1 || true
  )"
  if [[ -z "${container_id}" ]]; then
    return 0
  fi

  docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

runtime_backend_image_value() {
  local service="$1"
  local key
  key="$(backend_image_key "${service}")"
  trim_quotes "$(
    awk -F= -v key="${key}" '
      $1 == key {
        value = substr($0, index($0, "=") + 1)
      }
      END {
        print value
      }
    ' "${ENV_FILE}"
  )"
}

upsert_runtime_backend_image() {
  local service="$1"
  local image="$2"
  local key
  key="$(backend_image_key "${service}")"
  require_digest_image_value "${key}" "${image}"
  upsert_env_key "${key}" "${image}"
}

resolve_preserved_backend_image() {
  local service="$1"
  local fallback="$2"
  local image
  image="$(runtime_backend_image_value "${service}")"
  if [[ -n "${image}" ]]; then
    echo "${image}"
    return 0
  fi

  image="$(container_image_for_service_any_state "${service}" || true)"
  if [[ -n "${image}" ]]; then
    echo "${image}"
    return 0
  fi

  image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -n "${image}" ]]; then
    echo "${image}"
    return 0
  fi

  echo "${fallback}"
}

write_backend_release_state() {
  local active_backend="$1"
  local previous_backend="$2"
  local active_image previous_image
  active_image="$(runtime_backend_image_value "${active_backend}")"
  previous_image="$(runtime_backend_image_value "${previous_backend}")"

  {
    printf 'active_backend=%s\n' "${active_backend}"
    printf 'previous_backend=%s\n' "${previous_backend}"
    printf 'active_backend_image=%s\n' "${active_image}"
    printf 'previous_backend_image=%s\n' "${previous_image}"
    printf 'back_blue_image=%s\n' "$(runtime_backend_image_value "back_blue")"
    printf 'back_green_image=%s\n' "$(runtime_backend_image_value "back_green")"
    printf 'back_read_image=%s\n' "$(runtime_backend_image_value "back_read")"
    printf 'back_admin_image=%s\n' "$(runtime_backend_image_value "back_admin")"
    printf 'back_worker_image=%s\n' "$(runtime_backend_image_value "back_worker")"
  } > "${RELEASE_STATE_FILE}"
}

prepare_runtime_backend_images() {
  local active_backend="$1"
  local next_backend="$2"
  local staged_image="$3"
  local active_image

  active_image="$(resolve_preserved_backend_image "${active_backend}" "${staged_image}")"
  upsert_runtime_backend_image "${active_backend}" "${active_image}"
  upsert_runtime_backend_image "${next_backend}" "${staged_image}"
  local service
  for service in back_read back_admin back_worker; do
    upsert_runtime_backend_image "${service}" "${active_image}"
  done

  write_backend_release_state "${active_backend}" "${next_backend}"
  echo "runtime backend image map prepared: active=${active_backend} active_image=${active_image} next=${next_backend} next_image=${staged_image} helper_image=${active_image}"
}

require_nonempty_env_key() {
  local key="$1"
  local value
  value="$(trim_quotes "$(env_value "${key}")")"
  if [[ -z "${value}" ]]; then
    echo "required env key is missing or empty: ${key}" >&2
    return 1
  fi
}

require_pinned_image_env_key() {
  local key="$1"
  local value
  value="$(trim_quotes "$(env_value "${key}")")"

  if [[ -z "${value}" ]]; then
    echo "required image env key is missing: ${key}" >&2
    return 1
  fi
  if [[ "${value}" == *":latest" ]]; then
    echo "latest tag is not allowed for ${key}: ${value}" >&2
    return 1
  fi
  if [[ "${value}" != *@sha256:* && "${value}" != *:* ]]; then
    echo "image must have tag or digest for ${key}: ${value}" >&2
    return 1
  fi
}

require_digest_image_env_key() {
  local key="$1"
  local value
  value="$(trim_quotes "$(env_value "${key}")")"

  if [[ -z "${value}" ]]; then
    echo "required image env key is missing: ${key}" >&2
    return 1
  fi
  if [[ "${value}" == *":latest"* ]]; then
    echo "latest tag is not allowed for ${key}: ${value}" >&2
    return 1
  fi
  if [[ ! "${value}" =~ @sha256:[a-fA-F0-9]{64}$ ]]; then
    echo "image must include sha256 digest for ${key}: ${value}" >&2
    return 1
  fi
}

validate_required_runtime_env() {
  require_nonempty_env_key "API_DOMAIN"
  require_nonempty_env_key "CF_TUNNEL_TOKEN"
  require_nonempty_env_key "PROD___SPRING__DATASOURCE__USERNAME"
  require_nonempty_env_key "PROD___SPRING__DATASOURCE__PASSWORD"
  require_nonempty_env_key "PROD___POSTGRES__PASSWORD"
  ensure_image_env_key_from_local_digest "CLOUDFLARED_IMAGE" "cloudflare/cloudflared:latest"
  ensure_image_env_key_from_local_digest "AUTOHEAL_IMAGE" "willfarrell/autoheal:1.2.0"
  ensure_image_env_key_from_local_digest "CADDY_IMAGE" "caddy:2.8-alpine"
  ensure_image_env_key_from_local_digest "UPTIME_KUMA_IMAGE" "louislam/uptime-kuma:1"
  ensure_image_env_key_from_local_digest "PROMETHEUS_IMAGE" "prom/prometheus:v2.54.1"
  ensure_image_env_key_from_local_digest "ALERTMANAGER_IMAGE" "prom/alertmanager:v0.27.0"
  ensure_image_env_key_from_local_digest "POSTGRES_EXPORTER_IMAGE" "quay.io/prometheuscommunity/postgres-exporter:v0.15.0"
  ensure_image_env_key_from_local_digest "GRAFANA_IMAGE" "grafana/grafana:11.2.2"
  ensure_image_env_key_from_local_digest "LOKI_IMAGE" "grafana/loki:3.0.0"
  ensure_image_env_key_from_local_digest "PROMTAIL_IMAGE" "grafana/promtail:3.0.0"
  ensure_image_env_key_from_local_digest "NODE_RUNTIME_IMAGE" "node:20-alpine"
  ensure_image_env_key_from_local_digest "DB_IMAGE" "jangka512/pgj:latest"
  ensure_image_env_key_from_local_digest "REDIS_IMAGE" "redis:7-alpine"
  ensure_image_env_key_from_local_digest "MINIO_IMAGE" "minio/minio:latest"
  require_digest_image_env_key "CLOUDFLARED_IMAGE"
  require_digest_image_env_key "AUTOHEAL_IMAGE"
  require_digest_image_env_key "CADDY_IMAGE"
  require_digest_image_env_key "UPTIME_KUMA_IMAGE"
  require_digest_image_env_key "PROMETHEUS_IMAGE"
  require_digest_image_env_key "ALERTMANAGER_IMAGE"
  require_digest_image_env_key "POSTGRES_EXPORTER_IMAGE"
  require_digest_image_env_key "GRAFANA_IMAGE"
  require_digest_image_env_key "LOKI_IMAGE"
  require_digest_image_env_key "PROMTAIL_IMAGE"
  require_digest_image_env_key "NODE_RUNTIME_IMAGE"
  require_digest_image_env_key "DB_IMAGE"
  require_digest_image_env_key "REDIS_IMAGE"
  require_digest_image_env_key "MINIO_IMAGE"
}

ensure_monitoring_bind_mount_permissions() {
  find "${SCRIPT_DIR}/monitoring" -type d -exec chmod 0755 {} + 2>/dev/null || true
  find "${SCRIPT_DIR}/monitoring" -type f -exec chmod 0644 {} + 2>/dev/null || true
}

reset_grafana_admin_password() {
  local grafana_password
  grafana_password="$(trim_quotes "$(env_value "GRAFANA_ADMIN_PASSWORD")")"
  if [[ -z "${grafana_password}" ]]; then
    echo "skip grafana admin password reset: missing GRAFANA_ADMIN_PASSWORD" >&2
    return 0
  fi

  compose exec -T grafana grafana cli admin reset-admin-password "${grafana_password}" >/dev/null 2>&1 || true
}

resolve_prod_db_name() {
  local db_name

  db_name="$(trim_quotes "$(env_value "custom.prod.dbName")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  db_name="$(trim_quotes "$(env_value "CUSTOM_PROD_DBNAME")")"
  if [[ -n "${db_name}" ]]; then
    echo "${db_name}"
    return
  fi

  local db_base_name
  db_base_name="$(trim_quotes "$(env_value "DB_BASE_NAME")")"
  if [[ -z "${db_base_name}" ]]; then
    db_base_name="blog"
  fi
  echo "${db_base_name}_prod"
}

validate_db_runtime_role_env() {
  local runtime_user flyway_user
  runtime_user="$(trim_quotes "$(env_value "PROD___SPRING__DATASOURCE__USERNAME")")"
  flyway_user="$(trim_quotes "$(env_value "PROD___SPRING__FLYWAY__USER")")"
  if [[ -z "${flyway_user}" ]]; then
    flyway_user="postgres"
  fi

  if [[ -z "${runtime_user}" ]]; then
    echo "runtime datasource user must be set (PROD___SPRING__DATASOURCE__USERNAME)" >&2
    return 1
  fi
  if [[ "${runtime_user}" == "postgres" ]]; then
    echo "runtime datasource user must not be postgres" >&2
    return 1
  fi
  if [[ "${runtime_user}" == "${flyway_user}" ]]; then
    echo "runtime datasource user and flyway user must be separated" >&2
    return 1
  fi
}

provision_db_runtime_role() {
  local runtime_user runtime_password flyway_user db_name
  runtime_user="$(trim_quotes "$(env_value "PROD___SPRING__DATASOURCE__USERNAME")")"
  runtime_password="$(trim_quotes "$(env_value "PROD___SPRING__DATASOURCE__PASSWORD")")"
  flyway_user="$(trim_quotes "$(env_value "PROD___SPRING__FLYWAY__USER")")"
  if [[ -z "${flyway_user}" ]]; then
    flyway_user="postgres"
  fi
  db_name="$(resolve_prod_db_name)"

  if [[ -z "${runtime_user}" || -z "${runtime_password}" ]]; then
    echo "runtime datasource credential is incomplete" >&2
    return 1
  fi

  if ! [[ "${runtime_user}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "runtime datasource user must match postgres identifier pattern: ${runtime_user}" >&2
    return 1
  fi
  if ! [[ "${flyway_user}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "flyway user must match postgres identifier pattern: ${flyway_user}" >&2
    return 1
  fi

  if compose exec -T db_1 psql -U postgres -d "${db_name}" -v ON_ERROR_STOP=1 \
    -v runtime_user="${runtime_user}" \
    -v runtime_password="${runtime_password}" \
    -v migration_user="${flyway_user}" >/dev/null 2>&1 <<'SQL'; then
SELECT set_config('app.runtime_user', :'runtime_user', false);
SELECT set_config('app.runtime_password', :'runtime_password', false);
SELECT set_config('app.migration_user', :'migration_user', false);

DO $$
DECLARE
  runtime_user text := current_setting('app.runtime_user');
  runtime_password text := current_setting('app.runtime_password');
  migration_user text := current_setting('app.migration_user');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_user) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', runtime_user, runtime_password);
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', runtime_user, runtime_password);
  END IF;

  EXECUTE format('ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', runtime_user);
  EXECUTE format('GRANT CONNECT, TEMP ON DATABASE %I TO %I', current_database(), runtime_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', runtime_user);
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', runtime_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', migration_user, runtime_user);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I', migration_user, runtime_user);
END $$;
SQL
    echo "runtime role provisioned in ${db_name}: runtime=${runtime_user}, migration=${flyway_user}"
    return 0
  fi

  echo "runtime role provision failed in ${db_name}" >&2
  return 1
}

ensure_db_runtime_guards() {
  local db_name
  db_name="$(resolve_prod_db_name)"

  local guard_sql
  guard_sql=$'
ALTER TABLE IF EXISTS public.post ADD COLUMN IF NOT EXISTS content_html TEXT;

DO $$
BEGIN
  IF to_regclass('"'"'public.post_like'"'"') IS NOT NULL AND to_regclass('"'"'public.post_like_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_like_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_like), 1), false);
  END IF;
  IF to_regclass('"'"'public.post_attr'"'"') IS NOT NULL AND to_regclass('"'"'public.post_attr_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_attr_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_attr), 1), false);
  END IF;
  IF to_regclass('"'"'public.post_comment'"'"') IS NOT NULL AND to_regclass('"'"'public.post_comment_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.post_comment_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.post_comment), 1), false);
  END IF;
  IF to_regclass('"'"'public.member_attr'"'"') IS NOT NULL AND to_regclass('"'"'public.member_attr_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.member_attr_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.member_attr), 1), false);
  END IF;
  IF to_regclass('"'"'public.task'"'"') IS NOT NULL AND to_regclass('"'"'public.task_seq'"'"') IS NOT NULL THEN
    PERFORM setval('"'"'public.task_seq'"'"', COALESCE((SELECT MAX(id) + 1 FROM public.task), 1), false);
  END IF;
END $$;
'

  if compose exec -T db_1 psql -U postgres -d "${db_name}" -v ON_ERROR_STOP=1 -c "${guard_sql}" >/dev/null 2>&1; then
    echo "schema/sequence guard ok in ${db_name}"
    return 0
  fi

  echo "schema/sequence guard warning: failed in ${db_name}; continue with Flyway" >&2
  return 1
}

validate_storage_env() {
  local enabled_raw endpoint access_key secret_key
  enabled_raw="$(trim_quotes "$(env_value "CUSTOM_STORAGE_ENABLED")")"
  endpoint="$(trim_quotes "$(env_value "CUSTOM_STORAGE_ENDPOINT")")"
  access_key="$(trim_quotes "$(env_value "CUSTOM_STORAGE_ACCESSKEY")")"
  secret_key="$(trim_quotes "$(env_value "CUSTOM_STORAGE_SECRETKEY")")"

  local enabled
  enabled="$(echo "${enabled_raw}" | tr '[:upper:]' '[:lower:]')"

  if [[ "${enabled}" != "true" ]]; then
    return 0
  fi

  if ! [[ "${endpoint}" =~ ^https?://.+$ ]]; then
    echo "invalid CUSTOM_STORAGE_ENDPOINT: '${endpoint:-<empty>}'" >&2
    echo "expected format example: http://minio:9000" >&2
    return 1
  fi

  if [[ "${endpoint}" == *'${'* ]]; then
    echo "invalid CUSTOM_STORAGE_ENDPOINT: unresolved placeholder detected -> '${endpoint}'" >&2
    echo "set a concrete value like: CUSTOM_STORAGE_ENDPOINT=http://minio:9000" >&2
    return 1
  fi

  if [[ "${endpoint}" == "http:" || "${endpoint}" == "https:" ]]; then
    echo "invalid CUSTOM_STORAGE_ENDPOINT: '${endpoint}'" >&2
    echo "endpoint lost host/port. expected format example: http://minio:9000" >&2
    return 1
  fi

  if [[ "${access_key}" == *'${'* || "${secret_key}" == *'${'* ]]; then
    echo "invalid storage credentials: unresolved placeholder detected in CUSTOM_STORAGE_ACCESSKEY/CUSTOM_STORAGE_SECRETKEY" >&2
    echo "do not use literal '\${...}' in .env.prod for back service credentials" >&2
    return 1
  fi

  echo "storage endpoint validation ok: ${endpoint}"
}

backend_host() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_blue"
    return
  fi
  echo "back_green"
}

backend_http_host() {
  local backend="$1"
  case "${backend}" in
    back_blue|back_green|back_read|back_admin|back_worker)
      echo "${backend}"
      ;;
    *)
      echo "unknown backend service for healthcheck: ${backend}" >&2
      return 1
      ;;
  esac
}

resolve_in_caddy() {
  local host="$1"
  compose exec -T caddy getent hosts "${host}" >/dev/null 2>&1
}

reload_caddy() {
  compose exec -T caddy caddy reload --config "${CADDY_CONTAINER_FILE}"
}

normalize_backend_name() {
  local value="$1"
  value="${value//-/_}"
  echo "${value}"
}

host_env_value() {
  local key="$1"
  trim_quotes "$(env_value "${key}")"
}

mounted_env_value() {
  local key="$1"
  compose exec -T caddy sh -lc "printenv ${key}" 2>/dev/null | tr -d '\r' | head -n 1
}

resolve_caddy_upstream_token() {
  local token="$1"
  local scope="${2:-host}"

  if [[ "${token}" =~ ^([a-zA-Z0-9_-]+):8080$ ]]; then
    normalize_backend_name "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "${token}" =~ ^\{\$([A-Z0-9_]+):([a-zA-Z0-9_-]+)\}:8080$ ]]; then
    local key="${BASH_REMATCH[1]}"
    local default_value
    local resolved_value
    default_value="$(normalize_backend_name "${BASH_REMATCH[2]}")"
    if [[ "${scope}" == "mounted" ]]; then
      resolved_value="$(normalize_backend_name "$(mounted_env_value "${key}")")"
    else
      resolved_value="$(normalize_backend_name "$(host_env_value "${key}")")"
    fi
    if [[ -n "${resolved_value}" ]]; then
      echo "${resolved_value}"
      return 0
    fi
    echo "${default_value}"
    return 0
  fi

  return 1
}

current_caddy_upstream_host() {
  local token
  token="$(awk '$1 == "reverse_proxy" && $2 ~ /^(back[-_](blue|green|read|admin):8080|\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080)$/ {print $2; exit}' "${CADDY_FILE}")"
  resolve_caddy_upstream_token "${token}" "host" || true
}

current_caddy_mounted_upstream_host() {
  local token
  token="$(compose exec -T caddy awk '$1 == "reverse_proxy" && $2 ~ /^(back[-_](blue|green|read|admin):8080|\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080)$/ {print $2; exit}' "${CADDY_CONTAINER_FILE}" 2>/dev/null | tr -d '\r' | head -n 1)"
  resolve_caddy_upstream_token "${token}" "mounted" || true
}

caddy_mounted_has_legacy_back_active() {
  compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}"
}

host_caddy_sha256() {
  sha256sum "${CADDY_FILE}" 2>/dev/null | awk '{print $1}' | tr -d '\r'
}

mounted_caddy_sha256() {
  compose exec -T caddy sh -lc "sha256sum ${CADDY_CONTAINER_FILE} | awk '{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1
}

ensure_caddy_mount_sync() {
  local host_upstream mounted_upstream legacy_token host_hash mounted_hash
  host_upstream="$(current_caddy_upstream_host)"
  mounted_upstream="$(current_caddy_mounted_upstream_host)"
  host_hash="$(host_caddy_sha256)"
  mounted_hash="$(mounted_caddy_sha256)"
  legacy_token="false"
  if caddy_mounted_has_legacy_back_active; then
    legacy_token="true"
  fi

  if [[ "${legacy_token}" == "false" && -n "${host_upstream}" && "${host_upstream}" == "${mounted_upstream}" && -n "${host_hash}" && -n "${mounted_hash}" && "${host_hash}" == "${mounted_hash}" ]]; then
    echo "caddy config sync ok: upstream=${mounted_upstream}, sha256=${mounted_hash}"
    return 0
  fi

  echo "caddy config drift detected: host=${host_upstream:-none}, mounted=${mounted_upstream:-none}, host_sha=${host_hash:-none}, mounted_sha=${mounted_hash:-none}, legacy_back_active=${legacy_token}" >&2
  echo "force-recreate caddy to re-mount config directory" >&2
  compose up -d --force-recreate caddy >/dev/null
  reload_caddy

  mounted_upstream="$(current_caddy_mounted_upstream_host)"
  mounted_hash="$(mounted_caddy_sha256)"
  legacy_token="false"
  if caddy_mounted_has_legacy_back_active; then
    legacy_token="true"
  fi

  if [[ "${legacy_token}" == "false" && -n "${host_upstream}" && "${host_upstream}" == "${mounted_upstream}" && -n "${host_hash}" && -n "${mounted_hash}" && "${host_hash}" == "${mounted_hash}" ]]; then
    echo "caddy config sync repaired: upstream=${mounted_upstream}, sha256=${mounted_hash}"
    return 0
  fi

  echo "caddy config sync failed after recreate: host=${host_upstream:-none}, mounted=${mounted_upstream:-none}, host_sha=${host_hash:-none}, mounted_sha=${mounted_hash:-none}, legacy_back_active=${legacy_token}" >&2
  run_compose_diagnostic logs --no-color --tail=120 caddy >&2 || true
  return 1
}

set_caddy_upstream_backend() {
  local backend="$1"
  local active_host
  active_host="$(backend_http_host "${backend}")"

  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    upsert_env_key "ADMIN_API_UPSTREAM" "${active_host}"
    upsert_env_key "READ_API_UPSTREAM" "${active_host}"
  fi

  # Keep content rewrite in-place; avoids stale config when external tools swap files.
  local rewritten
  rewritten="$(sed -E \
    -e 's/\{\$ADMIN_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/'"${active_host}"':8080/g' \
    -e 's/\{\$READ_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/'"${active_host}"':8080/g' \
    -e "s/back[-_](blue|green|active):8080( +back[-_](blue|green|active):8080)?/${active_host}:8080/g" \
    "${CADDY_FILE}")"
  printf '%s\n' "${rewritten}" > "${CADDY_FILE}"
  reload_caddy
  echo "caddy upstream switched to active=${active_host}:8080"
}

persist_single_runtime_caddy_upstreams() {
  local backend="$1"
  local active_host
  active_host="$(backend_http_host "${backend}")"
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    return 0
  fi
  upsert_env_key "ADMIN_API_UPSTREAM" "${active_host}"
  upsert_env_key "READ_API_UPSTREAM" "${active_host}"
  echo "single-runtime caddy env upstream fixed: active=${active_host}"
}

is_healthy_http_code() {
  local code="$1"
  [[ "${code}" == "200" ]]
}

is_cacheable_warmup_http_code() {
  local code="$1"
  [[ "${code}" =~ ^2[0-9][0-9]$ || "${code}" == "304" ]]
}

get_caddy_ip() {
  local host="$1"
  compose exec -T caddy sh -lc "getent hosts ${host} | awk 'NR==1{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1
}

check_backend_dns_from_caddy() {
  local backend="$1"
  local host
  host="$(backend_http_host "${backend}")"

  if ! resolve_in_caddy "${host}"; then
    echo "caddy dns resolve failed: ${host}" >&2
    return 1
  fi

  local ip
  ip="$(get_caddy_ip "${host}")"
  echo "caddy dns ok: ${host} -> ${ip:-unknown}"
}

is_backend_running() {
  local backend="$1"
  compose ps --status running --services 2>/dev/null | grep -qx "${backend}"
}

check_required_backend_dns_from_caddy() {
  local next_backend="$1"
  local active_backend="$2"

  # Cutover 대상 backend는 반드시 DNS 해석이 가능해야 한다.
  check_backend_dns_from_caddy "${next_backend}"

  # 현재 active backend는 실행 중일 때만 DNS를 점검한다.
  if [[ "${active_backend}" != "${next_backend}" ]] && is_backend_running "${active_backend}"; then
    if ! check_backend_dns_from_caddy "${active_backend}"; then
      echo "warning: dns check failed for active backend (${active_backend}); continue with cutover target=${next_backend}" >&2
    fi
  else
    echo "skip dns check for inactive backend: ${active_backend}"
  fi
}

runtime_split_helper_backends() {
  local services=(back_worker)
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    services+=(back_read back_admin)
  fi
  printf '%s\n' "${services[@]}"
}

start_runtime_split_helper_backends_on_active() {
  local active_backend="$1"
  local active_image
  active_image="$(runtime_backend_image_value "${active_backend}")"
  if [[ -z "${active_image}" ]]; then
    echo "runtime helper startup failed: active backend image missing for ${active_backend}" >&2
    return 1
  fi

  local helper_services=()
  local service
  while IFS= read -r service; do
    [[ -n "${service}" ]] || continue
    upsert_runtime_backend_image "${service}" "${active_image}"
    helper_services+=("${service}")
  done < <(runtime_split_helper_backends)

  if [[ "${#helper_services[@]}" -eq 0 ]]; then
    return 0
  fi

  echo "starting runtime helper backends on active image before edge boot: active=${active_backend}, services=${helper_services[*]}"
  compose pull "${helper_services[@]}" || true
  if ! compose_up_force_recreate_with_retry "${helper_services[@]}"; then
    for service in "${helper_services[@]}"; do
      emit_backend_diagnostics "${service}" >&2 || true
    done
    return 1
  fi

  for service in "${helper_services[@]}"; do
    if ! check_backend_health "${service}"; then
      echo "runtime helper backend unhealthy on active image: ${service}" >&2
      return 1
    fi
  done
  return 0
}

restart_runtime_split_backends_after_candidate_ready() {
  local candidate_backend="$1"
  local candidate_image
  candidate_image="$(runtime_backend_image_value "${candidate_backend}")"
  if [[ -z "${candidate_image}" ]]; then
    echo "runtime helper restart failed: candidate backend image missing for ${candidate_backend}" >&2
    return 1
  fi

  local helper_services=()
  local service
  while IFS= read -r service; do
    [[ -n "${service}" ]] || continue
    upsert_runtime_backend_image "${service}" "${candidate_image}"
    helper_services+=("${service}")
  done < <(runtime_split_helper_backends)

  if [[ "${#helper_services[@]}" -eq 0 ]]; then
    return 0
  fi

  echo "restarting runtime helper backends after candidate health: candidate=${candidate_backend}, services=${helper_services[*]}"
  compose pull "${helper_services[@]}"
  if ! compose_up_force_recreate_with_retry "${helper_services[@]}"; then
    for service in "${helper_services[@]}"; do
      emit_backend_diagnostics "${service}" >&2 || true
    done
    return 1
  fi

  for service in "${helper_services[@]}"; do
    if ! check_backend_health "${service}"; then
      echo "runtime helper backend unhealthy after restart: ${service}" >&2
      return 1
    fi
  done
  return 0
}

restore_runtime_split_helper_backends_to_active() {
  local active_backend="$1"
  local failed_candidate="$2"
  local active_image
  active_image="$(runtime_backend_image_value "${active_backend}")"
  if [[ -z "${active_image}" ]]; then
    echo "runtime helper recovery failed: active backend image missing for ${active_backend}" >&2
    return 1
  fi

  local helper_services=()
  local service
  while IFS= read -r service; do
    [[ -n "${service}" ]] || continue
    upsert_runtime_backend_image "${service}" "${active_image}"
    helper_services+=("${service}")
  done < <(runtime_split_helper_backends)

  if [[ "${#helper_services[@]}" -eq 0 ]]; then
    return 0
  fi

  echo "recovering runtime helper backends to active image: active=${active_backend}, failed_candidate=${failed_candidate}, services=${helper_services[*]}"
  compose pull "${helper_services[@]}" || true
  if ! compose_up_force_recreate_with_retry "${helper_services[@]}"; then
    for service in "${helper_services[@]}"; do
      emit_backend_diagnostics "${service}" >&2 || true
    done
    return 1
  fi

  for service in "${helper_services[@]}"; do
    if ! check_backend_health "${service}"; then
      echo "runtime helper backend unhealthy after active-image recovery: ${service}" >&2
      return 1
    fi
  done
  write_backend_release_state "${active_backend}" "${failed_candidate}"
  return 0
}

probe_caddy_http_code() {
  local api_domain="$1"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" "http://caddy:80${HEALTHCHECK_PATH}" \
    -H "Host: ${api_domain}" || true
}

probe_caddy_route_http_code() {
  local api_domain="$1"
  local path="$2"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${PREWARM_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${PREWARM_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" "http://caddy:80${path}" \
    -H "Host: ${api_domain}" || true
}

prewarm_public_read_cache() {
  local api_domain="$1"
  if [[ "${PREWARM_ENABLED}" != "true" ]]; then
    echo "prewarm skipped: PREWARM_ENABLED=${PREWARM_ENABLED}"
    return 0
  fi

  local warm_paths=(
    "/post/api/v1/posts/feed?page=1&pageSize=30&sort=CREATED_AT"
    "/post/api/v1/posts/feed/cursor?pageSize=30&sort=CREATED_AT"
    "/post/api/v1/posts/explore?page=1&pageSize=30&sort=CREATED_AT"
    "/post/api/v1/posts/tags"
  )

  local max_attempts=$(( PREWARM_RETRIES + 1 ))

  prewarm_path_with_retry() {
    local path="$1"
    local label="$2"
    local attempt=1
    local code=""
    while [[ "${attempt}" -le "${max_attempts}" ]]; do
      code="$(probe_caddy_route_http_code "${api_domain}" "${path}")"
      if is_cacheable_warmup_http_code "${code}"; then
        echo "prewarm ok: ${label} status=${code} attempt=${attempt}/${max_attempts}"
        return 0
      fi
      if [[ "${attempt}" -lt "${max_attempts}" ]]; then
        sleep $(( PREWARM_BACKOFF_SECONDS * attempt ))
      fi
      attempt=$((attempt + 1))
    done
    echo "prewarm warn: ${label} status=${code:-none} attempts=${max_attempts}" >&2
    return 1
  }

  prewarm_explore_cursor_with_retry() {
    local tag="$1"
    local label="$2"
    local attempt=1
    local code=""
    while [[ "${attempt}" -le "${max_attempts}" ]]; do
      code="$(docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
        --connect-timeout "${PREWARM_CONNECT_TIMEOUT_SECONDS}" \
        --max-time "${PREWARM_MAX_TIME_SECONDS}" \
        --get \
        --data-urlencode "pageSize=30" \
        --data-urlencode "sort=CREATED_AT" \
        --data-urlencode "tag=${tag}" \
        -s -o /dev/null -w "%{http_code}" "http://caddy:80/post/api/v1/posts/explore/cursor" \
        -H "Host: ${api_domain}" || true)"
      if is_cacheable_warmup_http_code "${code}"; then
        echo "prewarm ok: ${label} status=${code} attempt=${attempt}/${max_attempts}"
        return 0
      fi
      if [[ "${attempt}" -lt "${max_attempts}" ]]; then
        sleep $(( PREWARM_BACKOFF_SECONDS * attempt ))
      fi
      attempt=$((attempt + 1))
    done
    echo "prewarm warn: ${label} status=${code:-none} attempts=${max_attempts}" >&2
    return 1
  }

  local path
  for path in "${warm_paths[@]}"; do
    prewarm_path_with_retry "${path}" "${path}" || true
  done

  local first_feed_id feed_body
  feed_body="$(docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${PREWARM_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${PREWARM_MAX_TIME_SECONDS}" \
    -s "http://caddy:80/post/api/v1/posts/feed/cursor?pageSize=30&sort=CREATED_AT" \
    -H "Host: ${api_domain}" || true)"
  first_feed_id="$(printf '%s' "${feed_body}" | awk -F'"id":' 'NF > 1 {split($2,a,/[^0-9]/); print a[1]; exit}')"
  if [[ -n "${first_feed_id}" ]]; then
    prewarm_path_with_retry "/post/api/v1/posts/${first_feed_id}" "/post/api/v1/posts/${first_feed_id}" || true
  else
    echo "prewarm skipped: no public post id available for detail warmup"
  fi

  local tags_body first_tag
  tags_body="$(docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${PREWARM_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${PREWARM_MAX_TIME_SECONDS}" \
    -s "http://caddy:80/post/api/v1/posts/tags" \
    -H "Host: ${api_domain}" || true)"
  first_tag="$(printf '%s' "${tags_body}" | awk -F'"tag":"' 'NF > 1 {split($2,a,"\""); print a[1]; exit}')"
  if [[ -n "${first_tag}" ]]; then
    prewarm_explore_cursor_with_retry "${first_tag}" "/post/api/v1/posts/explore/cursor(tag=${first_tag})" || true
  else
    echo "prewarm skipped: no public tags available for explore/cursor"
  fi

  # 실사용자 첫 paint를 줄이려면 API cache뿐 아니라 실제 public HTML route도 함께 데운다.
  prewarm_path_with_retry "/" "/" || true

  local sitemap_body latest_public_routes
  sitemap_body="$(docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${PREWARM_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${PREWARM_MAX_TIME_SECONDS}" \
    -s "http://caddy:80/sitemap.xml" \
    -H "Host: ${api_domain}" || true)"
  latest_public_routes="$(
    printf '%s' "${sitemap_body}" |
      grep -oE '<loc>https?://[^<]+/posts/[0-9]+</loc>' |
      sed -E 's#<loc>https?://[^/]+(/posts/[0-9]+)</loc>#\1#' |
      awk '!seen[$0]++' |
      head -n "${PREWARM_PUBLIC_ROUTE_POST_LIMIT}" || true
  )"

  if [[ -n "${latest_public_routes}" ]]; then
    while IFS= read -r route; do
      [[ -n "${route}" ]] || continue
      prewarm_path_with_retry "${route}" "${route}" || true
    done <<< "${latest_public_routes}"
  else
    echo "prewarm skipped: no public post routes available from sitemap"
  fi
}

check_backend_health() {
  local backend="$1"
  local host
  host="$(backend_http_host "${backend}")"
  local attempt=1

  while [[ "${attempt}" -le "${HEALTHCHECK_RETRIES}" ]]; do
    local code
    code="$({
      docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
        --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
        --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
        -s -o /dev/null -w "%{http_code}" \
        -H "Host: localhost" \
        "http://${host}:8080${HEALTHCHECK_PATH}"
    } || true)"

    if is_healthy_http_code "${code}"; then
      echo "healthcheck ok: ${backend} (status=${code})"
      return 0
    fi

    echo "healthcheck pending: ${backend} (try ${attempt}/${HEALTHCHECK_RETRIES}, status=${code:-none})"

    if (( attempt % HEALTHCHECK_LOG_EVERY_N_TRIES == 0 )); then
      echo "----- ${backend} progress logs (try ${attempt}) -----"
      run_compose_diagnostic ps "${backend}" || true
      run_compose_diagnostic logs --no-color --tail=60 "${backend}" || true
      echo "----- end progress logs -----"
    fi

    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done

  echo "healthcheck failed: ${backend}" >&2
  emit_backend_diagnostics "${backend}" >&2 || true
  return 1
}

check_candidate_backend_health() {
  local backend="$1"
  local previous_retries="${HEALTHCHECK_RETRIES}"
  HEALTHCHECK_RETRIES="${CANDIDATE_HEALTHCHECK_RETRIES}"
  check_backend_health "${backend}"
  local status=$?
  HEALTHCHECK_RETRIES="${previous_retries}"
  return "${status}"
}

check_notification_sse_route() {
  local api_domain="$1"
  local admin_email admin_password
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "notification sse probe skipped: missing CUSTOM__ADMIN__EMAIL or CUSTOM__ADMIN__PASSWORD"
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
      stream_body_file="$(mktemp)"
      trap "rm -f \"${cookie_jar}\" \"${stream_body_file}\"" EXIT
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

      stream_status="$(
        curl -sS -N \
          --connect-timeout 3 \
          --max-time 35 \
          -b "${cookie_jar}" \
          -H "Host: ${api_domain}" \
          -o "${stream_body_file}" \
          -w "%{http_code}" \
          "http://caddy:80/member/api/v1/notifications/stream" || true
      )"
      echo "stream_status=${stream_status}"
      tr -d "\r" < "${stream_body_file}"
    ' sh "${api_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
  )"

  if [[ "${probe_output}" == *"event: connected"* && "${probe_output}" == *"event: heartbeat"* ]]; then
    echo "notification sse probe ok: connected+heartbeat observed"
    return 0
  fi

  local login_status stream_status
  login_status="$(printf '%s\n' "${probe_output}" | sed -n 's/^login_status=//p' | head -n 1)"
  stream_status="$(printf '%s\n' "${probe_output}" | sed -n 's/^stream_status=//p' | head -n 1)"
  if printf '%s' "${login_status}" | grep -Eq '^2[0-9][0-9]$'; then
    if [[ "${stream_status}" == "401" || "${stream_status}" == "403" ]] || \
      printf '%s\n' "${probe_output}" | grep -Eq 'resultCode"[[:space:]]*:[[:space:]]*"401-'; then
      echo "notification sse probe warning: login ok but stream unauthorized (status=${stream_status:-none}); continuing deploy gate" >&2
      echo "${probe_output}" >&2
      return 0
    fi
  fi

  echo "notification sse probe failed" >&2
  echo "${probe_output}" >&2
  return 1
}

switch_caddy_upstream() {
  local target="$1"
  local host
  host="$(backend_http_host "${target}")"

  if ! resolve_in_caddy "${host}"; then
    echo "caddy dns resolve failed: ${host}" >&2
    return 1
  fi

  set_caddy_upstream_backend "${target}"
  ensure_caddy_mount_sync
}

verify_caddy_route() {
  local expected_backend="$1"
  local api_domain="$2"
  local expected_host
  expected_host="$(backend_http_host "${expected_backend}")"

  local attempt=1
  while [[ "${attempt}" -le 20 ]]; do
    local current_host
    current_host="$(current_caddy_upstream_host)"
    if [[ "${current_host}" != "${expected_host}" ]]; then
      echo "caddy upstream pending: current=${current_host:-none}, expected=${expected_host} (try ${attempt}/20)"
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    local codes=()
    local all_healthy="true"
    for _ in 1 2 3; do
      local code
      code="$(probe_caddy_http_code "${api_domain}")"
      codes+=("${code:-none}")
      if ! is_healthy_http_code "${code}"; then
        all_healthy="false"
      fi
    done

    if [[ "${all_healthy}" == "true" ]]; then
      echo "caddy route verify ok: ${expected_backend} (status=${codes[*]})"
      return 0
    fi
    echo "caddy route pending: status=${codes[*]} (try ${attempt}/20)"

    sleep 1
    attempt=$((attempt + 1))
  done

  run_compose_diagnostic logs --no-color --tail=120 caddy >&2 || true
  return 1
}

detect_active_backend() {
  local running_services
  running_services="$(compose ps --status running --services 2>/dev/null || true)"

  local blue_running="false"
  local green_running="false"
  if echo "${running_services}" | grep -qx "back_blue"; then blue_running="true"; fi
  if echo "${running_services}" | grep -qx "back_green"; then green_running="true"; fi

  if [[ -f "${STATE_FILE}" ]]; then
    local from_state
    from_state="$(cat "${STATE_FILE}" || true)"
    if [[ "${from_state}" == "back_blue" && "${blue_running}" == "true" ]]; then
      echo "back_blue"
      return
    fi
    if [[ "${from_state}" == "back_green" && "${green_running}" == "true" ]]; then
      echo "back_green"
      return
    fi
  fi

  if [[ "${blue_running}" == "true" && "${green_running}" != "true" ]]; then
    echo "back_blue"
    return
  fi
  if [[ "${green_running}" == "true" && "${blue_running}" != "true" ]]; then
    echo "back_green"
    return
  fi

  echo "back_blue"
}

other_backend() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_green"
    return
  fi
  echo "back_blue"
}

stop_backend_if_running() {
  local backend="$1"
  if is_backend_running "${backend}"; then
    compose stop "${backend}" || true
    echo "stopped inactive backend: ${backend}"
    return
  fi
  echo "inactive backend already stopped: ${backend}"
}

drain_and_stop_backend_if_running() {
  local backend="$1"
  if ! is_backend_running "${backend}"; then
    echo "inactive backend already stopped: ${backend}"
    return
  fi

  if (( STREAM_DRAIN_SECONDS > 0 )); then
    echo "draining old backend connections: ${backend} wait=${STREAM_DRAIN_SECONDS}s"
    sleep "${STREAM_DRAIN_SECONDS}"
  fi

  compose stop "${backend}" || true
  echo "stopped inactive backend after drain: ${backend}"
}

ensure_steady_state_guard() {
  local installer="${SCRIPT_DIR}/install_steady_state_guard_cron.sh"
  if [[ ! -x "${installer}" ]]; then
    echo "steady-state guard installer missing or not executable: ${installer}" >&2
    return 1
  fi
  "${installer}"
}

resolve_blue_green_burn_in_seconds() {
  local profile
  profile="$(echo "${BLUE_GREEN_BURN_IN_PROFILE}" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"

  local default_seconds
  case "${profile}" in
    disabled|off|none)
      default_seconds="0"
      ;;
    high|high-risk)
      default_seconds="${BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS}"
      ;;
    *)
      default_seconds="${BLUE_GREEN_BURN_IN_STANDARD_SECONDS}"
      ;;
  esac

  if [[ -n "${BLUE_GREEN_BURN_IN_SECONDS}" ]]; then
    normalize_non_negative_int "${BLUE_GREEN_BURN_IN_SECONDS}" "${default_seconds}"
    return
  fi

  echo "${default_seconds}"
}

rollback_caddy_route_only() {
  local previous_backend="$1"
  local candidate_backend="$2"
  local api_domain="$3"

  echo "burn-in failed; keeping previous backend active: previous=${previous_backend}, candidate=${candidate_backend}" >&2

  if ! is_backend_running "${previous_backend}"; then
    echo "burn-in rollback blocked: previous backend is not running: ${previous_backend}" >&2
    return 1
  fi

  if ! check_backend_dns_from_caddy "${previous_backend}"; then
    echo "burn-in rollback blocked: DNS not resolvable for ${previous_backend}" >&2
    return 1
  fi

  if ! check_backend_health "${previous_backend}"; then
    echo "burn-in rollback blocked: healthcheck failed for ${previous_backend}" >&2
    return 1
  fi

  switch_caddy_upstream "${previous_backend}"

  if ! verify_caddy_route "${previous_backend}" "${api_domain}"; then
    echo "burn-in rollback failed: caddy route verify failed" >&2
    return 1
  fi

  if ! restore_runtime_split_helper_backends_to_active "${previous_backend}" "${candidate_backend}"; then
    echo "burn-in rollback failed: helper recovery failed after route rollback" >&2
    compose stop "${candidate_backend}" || true
    return 1
  fi

  echo "${previous_backend}" > "${STATE_FILE}"
  write_backend_release_state "${previous_backend}" "${candidate_backend}"
  compose stop "${candidate_backend}" || true
  echo "burn-in rollback ok: route=${previous_backend}, stopped_candidate=${candidate_backend}"
  return 0
}

run_blue_green_burn_in() {
  local candidate_backend="$1"
  local previous_backend="$2"
  local api_domain="$3"
  local duration_seconds
  duration_seconds="$(resolve_blue_green_burn_in_seconds)"

  if (( duration_seconds == 0 )); then
    echo "burn-in skipped: profile=${BLUE_GREEN_BURN_IN_PROFILE}, duration_seconds=0"
    return 0
  fi

  echo "burn-in start: candidate=${candidate_backend}, previous=${previous_backend}, duration_seconds=${duration_seconds}, interval_seconds=${BLUE_GREEN_BURN_IN_PROBE_INTERVAL_SECONDS}"

  local elapsed=0
  local wait_seconds
  local post_code
  while (( elapsed < duration_seconds )); do
    wait_seconds="${BLUE_GREEN_BURN_IN_PROBE_INTERVAL_SECONDS}"
    if (( elapsed + wait_seconds > duration_seconds )); then
      wait_seconds=$((duration_seconds - elapsed))
    fi

    if (( wait_seconds > 0 )); then
      sleep "${wait_seconds}"
      elapsed=$((elapsed + wait_seconds))
    fi

    if ! check_backend_health "${candidate_backend}"; then
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${api_domain}" || true
      return 1
    fi

    if ! verify_caddy_route "${candidate_backend}" "${api_domain}"; then
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${api_domain}" || true
      return 1
    fi

    post_code="$(probe_caddy_http_code "${api_domain}")"
    if ! is_healthy_http_code "${post_code}"; then
      echo "burn-in public route verify failed (status=${post_code:-none})" >&2
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${api_domain}" || true
      return 1
    fi

    if ! check_notification_sse_route "${api_domain}"; then
      echo "burn-in notification sse verify failed" >&2
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${api_domain}" || true
      return 1
    fi

    if ! check_cloudflared_runtime "${api_domain}"; then
      echo "burn-in cloudflared runtime verify failed" >&2
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${api_domain}" || true
      return 1
    fi

  done

  echo "burn-in ok: candidate=${candidate_backend}, previous=${previous_backend}, duration_seconds=${duration_seconds}"
  return 0
}

rollback_to_backend() {
  local rollback_backend="$1"
  local api_domain="$2"

  echo "attempting rollback to ${rollback_backend}" >&2

  compose up -d "${rollback_backend}" || true

  if ! check_backend_dns_from_caddy "${rollback_backend}"; then
    echo "rollback blocked: DNS not resolvable for ${rollback_backend}" >&2
    return 1
  fi

  if ! check_backend_health "${rollback_backend}"; then
    echo "rollback blocked: healthcheck failed for ${rollback_backend}" >&2
    return 1
  fi

  local inactive_backend
  inactive_backend="$(other_backend "${rollback_backend}")"

  switch_caddy_upstream "${rollback_backend}"

  if ! verify_caddy_route "${rollback_backend}" "${api_domain}"; then
    echo "rollback failed: caddy route verify failed" >&2
    return 1
  fi

  if ! restore_runtime_split_helper_backends_to_active "${rollback_backend}" "${inactive_backend}"; then
    echo "rollback failed: helper recovery failed after route rollback" >&2
    return 1
  fi

  echo "${rollback_backend}" > "${STATE_FILE}"
  write_backend_release_state "${rollback_backend}" "${inactive_backend}"
  drain_and_stop_backend_if_running "${inactive_backend}"
  return 0
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${CADDY_FILE}" ]]; then
  echo "missing caddy file: ${CADDY_FILE}" >&2
  exit 1
fi

if ! acquire_deploy_lock; then
  exit 1
fi
trap 'resume_autoheal_if_paused; release_deploy_lock' EXIT INT TERM

require_supported_docker_engine
validate_storage_env
require_back_image
validate_required_runtime_env
configure_runtime_split_env
apply_auto_memory_tuner

api_domain="$(env_value "API_DOMAIN")"
if [[ -z "${api_domain}" ]]; then
  echo "missing API_DOMAIN in ${ENV_FILE}" >&2
  exit 1
fi

active_backend="$(detect_active_backend)"
if [[ "${active_backend}" == "back_blue" ]]; then
  next_backend="back_green"
else
  next_backend="back_blue"
fi

echo "active backend: ${active_backend}"
echo "next backend: ${next_backend}"

prepare_runtime_backend_images "${active_backend}" "${next_backend}" "${STAGED_BACK_IMAGE}"
persist_single_runtime_caddy_upstreams "${active_backend}"

action_backend_host="$(backend_host "${next_backend}")"

echo "starting infra before ${next_backend} (${action_backend_host})"
services_to_boot=(db_1 redis_1 minio_1 uptime_kuma autoheal)
compose_up_with_retry "${services_to_boot[@]}"
runtime_split_helpers_prebooted="false"
active_backend_was_running="false"
if is_backend_running "${active_backend}"; then
  active_backend_was_running="true"
  start_runtime_split_helper_backends_on_active "${active_backend}"
  runtime_split_helpers_prebooted="true"
else
  echo "skip active-image helper preboot: active backend is not running (${active_backend}); candidate will migrate first"
fi
edge_services_to_boot=(caddy cloudflared)
compose_up_with_retry "${edge_services_to_boot[@]}"
ensure_monitoring_bind_mount_permissions
compose_up_no_deps_with_retry loki promtail prometheus grafana
reset_grafana_admin_password
ensure_caddy_mount_sync
if [[ "${active_backend_was_running}" == "true" ]]; then
  check_cloudflared_runtime "${api_domain}"
else
  echo "skip cloudflared runtime check before candidate health: active backend is not running (${active_backend})"
fi
warn_grafana_embed_origin_route
warn_grafana_embed_public_route
validate_db_runtime_role_env
provision_db_runtime_role
ensure_db_runtime_guards || true
pause_autoheal_for_blue_green
compose pull "${next_backend}"
if ! compose_up_force_recreate_with_retry "${next_backend}"; then
  emit_backend_diagnostics "${next_backend}" >&2 || true
  exit 1
fi

# Verify cutover target DNS and currently running active backend DNS (if running).
check_required_backend_dns_from_caddy "${next_backend}" "${active_backend}"
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  if [[ "${runtime_split_helpers_prebooted}" == "true" ]]; then
    check_backend_dns_from_caddy "back_read"
    check_backend_dns_from_caddy "back_admin"
  else
    echo "skip runtime helper dns check before candidate health: helpers were not prebooted"
  fi
fi
if ! check_candidate_backend_health "${next_backend}"; then
  echo "candidate backend health failed before cutover: ${next_backend}" >&2
  compose stop "${next_backend}" || true
  exit 1
fi
if ! restart_runtime_split_backends_after_candidate_ready "${next_backend}"; then
  echo "runtime helper backend restart failed after ${next_backend} became healthy" >&2
  restore_runtime_split_helper_backends_to_active "${active_backend}" "${next_backend}" || true
  compose stop "${next_backend}" || true
  exit 1
fi
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  check_backend_dns_from_caddy "back_read"
  check_backend_dns_from_caddy "back_admin"
fi

switch_caddy_upstream "${next_backend}"

if ! verify_caddy_route "${next_backend}" "${api_domain}"; then
  rollback_to_backend "${active_backend}" "${api_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

post_code="$(probe_caddy_http_code "${api_domain}")"
if ! is_healthy_http_code "${post_code}"; then
  echo "post-switch verify failed (status=${post_code:-none})" >&2
  rollback_to_backend "${active_backend}" "${api_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

echo "post-switch phase: notification sse verify"
if ! check_notification_sse_route "${api_domain}"; then
  echo "post-switch notification sse verify failed" >&2
  rollback_to_backend "${active_backend}" "${api_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

echo "post-switch phase: blue/green burn-in"
if ! run_blue_green_burn_in "${next_backend}" "${active_backend}" "${api_domain}"; then
  exit 1
fi

echo "${next_backend}" > "${STATE_FILE}"
write_backend_release_state "${next_backend}" "${active_backend}"
drain_and_stop_backend_if_running "${active_backend}"

echo "post-switch phase: install steady-state guard"
ensure_steady_state_guard || true

echo "post-switch phase: cloudflared runtime verify"
if ! check_cloudflared_runtime "${api_domain}"; then
  echo "post-switch cloudflared runtime verify failed" >&2
  rollback_to_backend "${active_backend}" "${api_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

echo "post-switch phase: grafana embed route verify"
warn_grafana_embed_origin_route
warn_grafana_embed_public_route

echo "post-switch phase: public read prewarm"
prewarm_public_read_cache "${api_domain}"

echo "post-switch verify ok (status=${post_code}); burn-in complete; inactive backend stopped"
compose ps
