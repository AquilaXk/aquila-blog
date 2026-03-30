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
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-blog_home}"
NETWORK_NAME="blog_home_default"
DEPLOY_LOCK_DIR="${SCRIPT_DIR}/.deploy.lock"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/actuator/health/readiness}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-120}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_MAX_TIME_SECONDS="${HEALTHCHECK_MAX_TIME_SECONDS:-5}"
HEALTHCHECK_LOG_EVERY_N_TRIES="${HEALTHCHECK_LOG_EVERY_N_TRIES:-5}"
PREWARM_ENABLED="${PREWARM_ENABLED:-true}"
PREWARM_CONNECT_TIMEOUT_SECONDS="${PREWARM_CONNECT_TIMEOUT_SECONDS:-2}"
PREWARM_MAX_TIME_SECONDS="${PREWARM_MAX_TIME_SECONDS:-6}"
PREWARM_RETRIES="${PREWARM_RETRIES:-2}"
PREWARM_BACKOFF_SECONDS="${PREWARM_BACKOFF_SECONDS:-1}"
RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED:-false}"
RUNTIME_SPLIT_STAGE="${RUNTIME_SPLIT_STAGE:-A}"
AUTO_MEMORY_TUNER_ENABLED="${AUTO_MEMORY_TUNER_ENABLED:-true}"
AUTO_MEMORY_TUNER_MAX_BUDGET_MB="${AUTO_MEMORY_TUNER_MAX_BUDGET_MB:-2816}"
AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB="${AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB:-2048}"
AUTO_MEMORY_TUNER_MIN_BUDGET_MB="${AUTO_MEMORY_TUNER_MIN_BUDGET_MB:-1280}"
LAST_COMPOSE_UP_SERVICES=""
LAST_COMPOSE_UP_OUTPUT=""

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

RUNTIME_SPLIT_ENABLED="$(normalize_bool "${RUNTIME_SPLIT_ENABLED}")"
RUNTIME_SPLIT_STAGE="$(normalize_runtime_split_stage "${RUNTIME_SPLIT_STAGE}")"
AUTO_MEMORY_TUNER_ENABLED="$(normalize_bool "${AUTO_MEMORY_TUNER_ENABLED}")"
AUTO_MEMORY_TUNER_MAX_BUDGET_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_MAX_BUDGET_MB}" "2816")"
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
  compose ps -a "${backend}" || true
  if [[ -n "${cid}" ]]; then
    docker inspect --format "${backend} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}" "${cid}" || true
  else
    echo "${backend} container=none"
  fi

  if [[ -n "${LAST_COMPOSE_UP_SERVICES}" && ",${LAST_COMPOSE_UP_SERVICES// /,}," == *",${backend},"* ]]; then
    echo "[compose-up-output:${backend}]"
    printf '%s\n' "${LAST_COMPOSE_UP_OUTPUT}"
  fi

  compose logs --no-color --tail=200 "${backend}" || true
  echo "----- end ${backend} diagnostics -----"
}

cloudflared_registration_log_exists() {
  local logs="$1"
  if echo "${logs}" | grep -Eqi 'Registered tunnel connection|Connection .* registered'; then
    return 0
  fi
  return 1
}

check_cloudflared_runtime() {
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
    compose logs --no-color --tail=120 cloudflared >&2 || true
    return 1
  fi

  if [[ "${restart_count}" =~ ^[0-9]+$ ]] && (( restart_count > 5 )); then
    echo "cloudflared restart count is too high: ${restart_count}" >&2
    compose logs --no-color --tail=120 cloudflared >&2 || true
    return 1
  fi

  local cf_logs
  cf_logs="$(compose logs --no-color --tail=240 cloudflared || true)"
  if ! cloudflared_registration_log_exists "${cf_logs}"; then
    echo "cloudflared registration log missing in recent logs; restarting cloudflared once" >&2
    compose restart cloudflared >/dev/null || true
    sleep 2
    cf_logs="$(compose logs --no-color --tail=320 cloudflared || true)"
    if ! cloudflared_registration_log_exists "${cf_logs}"; then
      echo "cloudflared tunnel registration log not found" >&2
      echo "${cf_logs}" >&2
      return 1
    fi
  fi

  echo "cloudflared runtime check ok: status=${status}, restart_count=${restart_count}"
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

is_grafana_embed_url() {
  local url="$1"
  [[ "${url}" == *"grafana"* || "${url}" == *"/d/"* || "${url}" == *"/public-dashboards/"* ]]
}

probe_grafana_embed_headers() {
  local url="$1"
  curl -I -s --connect-timeout 3 --max-time 10 "${url}" 2>/dev/null || true
}

check_grafana_embed_public_route() {
  local url
  url="$(monitoring_embed_candidate_url)"
  if [[ -z "${url}" ]] || ! is_grafana_embed_url "${url}"; then
    echo "skip grafana embed route check: no grafana monitoring embed url configured"
    return 0
  fi

  local attempts=20
  local sleep_seconds=3
  local try=1
  local headers status location xfo csp

  while (( try <= attempts )); do
    headers="$(probe_grafana_embed_headers "${url}")"
    status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
    location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
    xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
    csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"

    if [[ -n "${status}" && "${location}" != *"/login"* ]] && [[ -z "${xfo}" || ! "${xfo}" =~ [Dd][Ee][Nn][Yy]|[Ss][Aa][Mm][Ee][Oo][Rr][Ii][Gg][Ii][Nn] ]]; then
      if [[ -z "${csp}" || "${csp}" != *"frame-ancestors"* || "${csp}" == *"aquilaxk.site"* || "${csp}" == *"*"* ]]; then
        echo "grafana embed public route ok: status=${status} url=${url}"
        return 0
      fi
    fi

    if (( try % 5 == 0 )); then
      echo "waiting grafana embed route (${try}/${attempts}) status=${status:-none} location=${location:-none} x-frame-options=${xfo:-none}" >&2
    fi
    sleep "${sleep_seconds}"
    try=$((try + 1))
  done

  echo "grafana embed public route check failed: url=${url} status=${status:-none} location=${location:-none} x-frame-options=${xfo:-none}" >&2
  if [[ -n "${csp}" ]]; then
    echo "grafana embed csp=${csp}" >&2
  fi
  return 1
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
  local blue_min=384
  local read_min=512
  local admin_min=512
  local worker_min=512
  local blue
  local read
  local admin
  local worker
  local total

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
    mode_min_budget_mb=2304
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

require_back_image() {
  local env_file_back_image
  env_file_back_image="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -n "${env_file_back_image}" ]]; then
    if [[ -n "${BACK_IMAGE:-}" && "${BACK_IMAGE}" != "${env_file_back_image}" ]]; then
      echo "BACK_IMAGE shell override detected. using ${ENV_FILE} value (${env_file_back_image})" >&2
    fi
    BACK_IMAGE="${env_file_back_image}"
    export BACK_IMAGE
  fi

  if [[ -z "${BACK_IMAGE:-}" ]]; then
    echo "BACK_IMAGE is empty. refusing deploy to avoid accidental latest-image rollout." >&2
    echo "set BACK_IMAGE=ghcr.io/<owner>/<repo>-back:sha-<commit7>" >&2
    exit 1
  fi

  if [[ "${BACK_IMAGE}" == *":latest" ]]; then
    echo "BACK_IMAGE latest tag is forbidden: ${BACK_IMAGE}" >&2
    echo "set BACK_IMAGE=ghcr.io/<owner>/<repo>-back:sha-<commit7>" >&2
    exit 1
  fi

  if [[ "${BACK_IMAGE}" != *@sha256:* && "${BACK_IMAGE}" != *:* ]]; then
    echo "BACK_IMAGE must include tag or digest: ${BACK_IMAGE}" >&2
    echo "set BACK_IMAGE=ghcr.io/<owner>/<repo>-back:sha-<commit7>" >&2
    exit 1
  fi
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

validate_required_runtime_env() {
  require_nonempty_env_key "API_DOMAIN"
  require_nonempty_env_key "CF_TUNNEL_TOKEN"
  ensure_image_env_key_from_local_digest "CLOUDFLARED_IMAGE" "cloudflare/cloudflared:latest"
  ensure_image_env_key_from_local_digest "DB_IMAGE" "jangka512/pgj:latest"
  ensure_image_env_key_from_local_digest "MINIO_IMAGE" "minio/minio:latest"
  require_pinned_image_env_key "CLOUDFLARED_IMAGE"
  require_pinned_image_env_key "DB_IMAGE"
  require_pinned_image_env_key "MINIO_IMAGE"
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
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_blue"
    return
  fi
  echo "back_green"
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
  compose logs --no-color --tail=120 caddy >&2 || true
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
  host="$(backend_host "${backend}")"

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
      compose ps "${backend}" || true
      compose logs --no-color --tail=60 "${backend}" || true
      echo "----- end progress logs -----"
    fi

    sleep "${HEALTHCHECK_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done

  echo "healthcheck failed: ${backend}" >&2
  emit_backend_diagnostics "${backend}" >&2 || true
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

  compose logs --no-color --tail=120 caddy >&2 || true
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

ensure_steady_state_guard() {
  local installer="${SCRIPT_DIR}/install_steady_state_guard_cron.sh"
  if [[ ! -x "${installer}" ]]; then
    echo "steady-state guard installer missing or not executable: ${installer}" >&2
    return 1
  fi
  "${installer}"
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

  switch_caddy_upstream "${rollback_backend}"

  if ! verify_caddy_route "${rollback_backend}" "${api_domain}"; then
    echo "rollback failed: caddy route verify failed" >&2
    return 1
  fi

  echo "${rollback_backend}" > "${STATE_FILE}"
  local inactive_backend
  inactive_backend="$(other_backend "${rollback_backend}")"
  stop_backend_if_running "${inactive_backend}"
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
trap 'release_deploy_lock' EXIT INT TERM

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

persist_single_runtime_caddy_upstreams "${active_backend}"

action_backend_host="$(backend_host "${next_backend}")"

echo "starting infra + ${next_backend} (${action_backend_host})"
services_to_boot=(db_1 redis_1 minio_1 caddy cloudflared uptime_kuma autoheal back_worker)
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  services_to_boot+=(back_read back_admin)
fi
compose_up_with_retry "${services_to_boot[@]}"
compose_up_no_deps_with_retry prometheus grafana
ensure_caddy_mount_sync
check_cloudflared_runtime
check_grafana_embed_public_route
ensure_db_runtime_guards || true
compose pull "${next_backend}"
if ! compose_up_force_recreate_with_retry "${next_backend}"; then
  emit_backend_diagnostics "${next_backend}" >&2 || true
  exit 1
fi

# Verify cutover target DNS and currently running active backend DNS (if running).
check_required_backend_dns_from_caddy "${next_backend}" "${active_backend}"
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  check_backend_dns_from_caddy "back_read"
  check_backend_dns_from_caddy "back_admin"
fi
check_backend_health "${next_backend}"

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

echo "${next_backend}" > "${STATE_FILE}"
stop_backend_if_running "${active_backend}"
ensure_steady_state_guard || true

check_cloudflared_runtime
check_grafana_embed_public_route
prewarm_public_read_cache "${api_domain}"

echo "post-switch verify ok (status=${post_code}); inactive backend stopped"
compose ps
