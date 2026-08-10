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
FRONT_STATE_FILE="${SCRIPT_DIR}/.active_front"
FRONT_RELEASE_STATE_FILE="${SCRIPT_DIR}/.front-release-state.env"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-blog_home}"
EDGE_NETWORK_NAME="blog_home_edge"
APP_NETWORK_NAME="blog_home_app"
OBSERVE_NETWORK_NAME="blog_home_observe"
DATA_NETWORK_NAME="blog_home_data"
NETWORK_NAME="${EDGE_NETWORK_NAME}"
MATERIALIZE_SERVICE_ENV_SCRIPT="${SCRIPT_DIR}/materialize_service_env.sh"
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
# 정규화 뒤에는 "셸이 넘기지 않음"과 "셸이 false로 넘김"이 구분되지 않는다. 그 구분이 필요해서
# 원본 제공 여부를 먼저 기록한다 - deploy.yml의 backend 경로는 이 값을 넘기지만 front 경로는
# .env.prod를 신뢰하고 넘기지 않는다(아래 resolve_runtime_split_from_env_file).
RUNTIME_SPLIT_ENABLED_FROM_SHELL="${RUNTIME_SPLIT_ENABLED+provided}"
RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED:-false}"
RUNTIME_SPLIT_STAGE="${RUNTIME_SPLIT_STAGE:-A}"
AUTO_MEMORY_TUNER_ENABLED="${AUTO_MEMORY_TUNER_ENABLED:-true}"
AUTO_MEMORY_TUNER_MAX_BUDGET_MB="${AUTO_MEMORY_TUNER_MAX_BUDGET_MB:-}"
AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB="${AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB:-2048}"
AUTO_MEMORY_TUNER_MIN_BUDGET_MB="${AUTO_MEMORY_TUNER_MIN_BUDGET_MB:-1280}"
LAST_COMPOSE_UP_SERVICES=""
LAST_COMPOSE_UP_OUTPUT=""
AUTOHEAL_PAUSED="false"

# backend rollout(기본)과 front rollout을 한 스크립트가 나눠 수행한다. front 배포는 backend와
# 독립 트리거이므로(#1539) backend 전체 시퀀스(DB role provisioning, monitoring 재생성,
# auto-memory-tuner, burn-in)를 다시 돌릴 수 없다. 공통 계층(compose wrapper, .env.prod 편집,
# caddy reload/mount sync, digest 검증, 진단 수집)은 그대로 재사용한다.
DEPLOY_TARGET="${DEPLOY_TARGET:-backend}"
# 컨테이너 healthcheck와 같은 정적 경로. Node 프로세스가 살아 있다는 것까지만 증명한다.
FRONT_LIVENESS_PATH="${FRONT_LIVENESS_PATH:-/robots.txt}"
# 공개 트래픽이 실제로 통과하는 렌더 경로. cutover 게이트는 여기까지 200이어야 통과한다.
FRONT_RENDER_PATH="${FRONT_RENDER_PATH:-/}"
# front -> backend 서버 사이드 경로. 실측(2026-08-02): BACKEND_INTERNAL_URL이 비어 있으면 컨테이너는
# healthy, `/`는 빌드 타임 프리렌더라 200인데 이 경로만 502였다. 렌더 경로까지만 보는 게이트는 그
# 상태를 통과시킨다. 공개 read GET이라 인증이 필요 없고 back_read 모드에서도 허용되는 경로를 쓴다.
#
# 트레이드오프: backend가 죽어 있으면 front-only hotfix도 이 게이트에서 막힌다. 의도한 것이다 —
# 이 경로가 502인 front는 로그인·목록·상세가 전부 죽은 상태이고, 그것을 "배포 성공"으로 보고하면
# 안 된다. backend 장애 중 front만 올려야 하는 예외 상황에서는 이 변수를 backend를 타지 않는
# 경로로 지정해 배포하고(예: /robots.txt), 그 사실이 배포 로그에 남는다.
FRONT_BACKEND_PROXY_PATH="${FRONT_BACKEND_PROXY_PATH:-/api/backend/post/api/v1/posts/tags}"
# first boot는 .next/cache가 비어 SSR이 전부 cold다.
#
# 시도당 최악 = 프로브 3개(liveness/render/backend proxy) x max-time + interval. 기본값으로
# 3x10s + 2s = 32s이고, 150회를 다 쓰면 80분이라 job timeout(60분)에 먼저 잘린다. 잘리면
# rollback 없이 끝나므로 시도 횟수가 아니라 **벽시계 예산**이 실질 상한이어야 한다.
# 600s는 cold SSR 기동 실측(수십 초)의 열 배 이상이면서 rollback과 후속 검증에 필요한 시간을
# job timeout 안에 남긴다.
FRONT_HEALTHCHECK_RETRIES="${FRONT_HEALTHCHECK_RETRIES:-150}"
FRONT_HEALTHCHECK_DEADLINE_SECONDS="${FRONT_HEALTHCHECK_DEADLINE_SECONDS:-600}"
FRONT_HEALTHCHECK_INTERVAL_SECONDS="${FRONT_HEALTHCHECK_INTERVAL_SECONDS:-2}"
FRONT_HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${FRONT_HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-3}"
FRONT_HEALTHCHECK_MAX_TIME_SECONDS="${FRONT_HEALTHCHECK_MAX_TIME_SECONDS:-10}"
FRONT_ROUTE_VERIFY_RETRIES="${FRONT_ROUTE_VERIFY_RETRIES:-20}"
FRONT_ROUTE_VERIFY_INTERVAL_SECONDS="${FRONT_ROUTE_VERIFY_INTERVAL_SECONDS:-2}"
STAGED_FRONT_IMAGE="${STAGED_FRONT_IMAGE:-}"
STAGED_FRONT_BUILD_SHA="${STAGED_FRONT_BUILD_SHA:-}"

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
  materialize_service_env_files
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
AUTO_MEMORY_TUNER_DEFAULT_MAX_BUDGET_MB=4096
if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
  AUTO_MEMORY_TUNER_DEFAULT_MAX_BUDGET_MB=4160
fi
AUTO_MEMORY_TUNER_MAX_BUDGET_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_MAX_BUDGET_MB}" "${AUTO_MEMORY_TUNER_DEFAULT_MAX_BUDGET_MB}")"
AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB}" "2048")"
AUTO_MEMORY_TUNER_MIN_BUDGET_MB="$(normalize_positive_int "${AUTO_MEMORY_TUNER_MIN_BUDGET_MB}" "1280")"
FRONT_HEALTHCHECK_RETRIES="$(normalize_positive_int "${FRONT_HEALTHCHECK_RETRIES}" "150")"
FRONT_HEALTHCHECK_DEADLINE_SECONDS="$(normalize_positive_int "${FRONT_HEALTHCHECK_DEADLINE_SECONDS}" "600")"
FRONT_HEALTHCHECK_INTERVAL_SECONDS="$(normalize_positive_int "${FRONT_HEALTHCHECK_INTERVAL_SECONDS}" "2")"
FRONT_ROUTE_VERIFY_RETRIES="$(normalize_positive_int "${FRONT_ROUTE_VERIFY_RETRIES}" "20")"
FRONT_ROUTE_VERIFY_INTERVAL_SECONDS="$(normalize_positive_int "${FRONT_ROUTE_VERIFY_INTERVAL_SECONDS}" "2")"

# env_value/trim_quotes는 이 파일 뒤쪽에 정의돼 있다. 호출은 compose() 실행 시점이라 순서 문제는
# 없고, ENV_FILE이 아직 없는 단계에서 부를 수 있으므로 존재 여부를 먼저 본다.
compose_profiles_from_env_file() {
  [[ -f "${ENV_FILE}" ]] || return 0
  trim_quotes "$(env_value "COMPOSE_PROFILES")"
}

# RUNTIME_SPLIT_ENABLED는 resolve_compose_profiles가 프로필 집합을 만들 때 쓰는 입력이다. 셸이
# 넘기지 않으면 false로 떨어지는데, front 경로(deploy.yml이 HOME_SERVER_ENV를 넘기지 않는다)에서
# 그러면 .env.prod가 runtime-split을 켜 두었어도 backend 경로와 **다른 프로필 집합**으로
# compose를 평가하게 된다. 셸 값이 없을 때만 파일을 읽는다 - 셸이 넘긴 값은 언제나 우선한다
# (check_deploy_status.sh가 probe와 모드를 맞추는 방식과 같다).
resolve_runtime_split_from_env_file() {
  [[ -z "${RUNTIME_SPLIT_ENABLED_FROM_SHELL}" ]] || return 0
  [[ -f "${ENV_FILE}" ]] || return 0

  local raw
  raw="$(trim_quotes "$(env_value "RUNTIME_SPLIT_ENABLED")")"
  [[ -n "${raw}" ]] || return 0

  RUNTIME_SPLIT_ENABLED="$(normalize_bool "${raw}")"
  echo "runtime-split resolved from ${ENV_FILE}: ${RUNTIME_SPLIT_ENABLED}"
}

# COMPOSE_PROFILES는 셸과 .env.prod 양쪽에 존재할 수 있는데, compose()가 해석 결과를 항상 명시
# 지정하므로 셸만 읽으면 .env.prod가 켠 프로필이 조용히 사라진다. RUNTIME_SPLIT_ENABLED=true인
# 배포 경로에서는 항상 "runtime-split" 하나만 반환돼 front 프로필이 통째로 유실됐다.
# 두 출처와 runtime-split 파생을 합집합으로 병합한다.
resolve_compose_profiles() {
  local raw="${COMPOSE_PROFILES:-},$(compose_profiles_from_env_file)"
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    raw="${raw},runtime-split"
  fi

  local profile out=""
  local IFS=','
  for profile in ${raw}; do
    profile="${profile//[[:space:]]/}"
    [[ -n "${profile}" ]] || continue
    [[ ",${out}," == *",${profile},"* ]] && continue
    if [[ -z "${out}" ]]; then
      out="${profile}"
    else
      out="${out},${profile}"
    fi
  done
  echo "${out}"
}

compose_profile_enabled() {
  local wanted="$1"
  local profiles
  profiles="$(resolve_compose_profiles)"
  [[ ",${profiles}," == *",${wanted},"* ]]
}

materialize_service_env_files() {
  bash "${MATERIALIZE_SERVICE_ENV_SCRIPT}" "${ENV_FILE}"
}

compose() {
  local profiles
  materialize_service_env_files
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

compose_up_force_recreate_no_deps_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  LAST_COMPOSE_UP_SERVICES="$*"
  LAST_COMPOSE_UP_OUTPUT=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d --force-recreate --no-deps "$@" 2>&1)"; then
      LAST_COMPOSE_UP_OUTPUT="${output}"
      echo "${output}"
      return 0
    fi

    LAST_COMPOSE_UP_OUTPUT="${output}"

    if grep -Eqi "network sandbox .* not found|context deadline exceeded|is not running|No such container" <<< "${output}"; then
      echo "compose up --force-recreate --no-deps retry (${attempt}/${max_attempts}) for services [$*]: ${output}" >&2
      sleep 2
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "compose up --force-recreate --no-deps failed after ${max_attempts} retries for services [$*]" >&2
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

# docker reports RFC3339 with a nanosecond fraction; GNU date parses that as-is
# while BSD date needs the fraction stripped. Prints an empty string when the
# timestamp is missing or unparsable so callers can skip the derived signal.
docker_timestamp_epoch() {
  local value="${1:-}"
  local trimmed="${value%%.*}"
  trimmed="${trimmed%Z}"
  if [[ -z "${trimmed}" || "${trimmed}" == "0001-01-01T00:00:00" ]]; then
    echo ""
    return 0
  fi
  date -u -d "${trimmed}Z" +%s 2>/dev/null \
    || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "${trimmed}Z" +%s 2>/dev/null \
    || true
}

# compose up only reports command exit status, so a container that keeps dying
# right after start (bad image entrypoint, bad env) still looks like success.
# Infra/monitoring containers are not on the request path, so warn + dump
# diagnostics instead of failing the backend rollout. Every command below is
# failure tolerant on purpose: this gate is diagnostic only and must never abort
# the deploy under `set -euo pipefail`.
warn_crashlooping_services() {
  local settle_seconds="${INFRA_CRASHLOOP_SETTLE_SECONDS:-5}"
  local recent_start_seconds="${INFRA_CRASHLOOP_RECENT_START_SECONDS:-120}"
  local unstable=0
  local now_epoch service cid status restarting exit_code restart_count
  local started_at started_epoch started_age reason

  if [[ "$#" -eq 0 ]]; then
    return 0
  fi

  sleep "${settle_seconds}" || true
  now_epoch="$(date -u +%s 2>/dev/null || echo "0")"

  for service in "$@"; do
    cid="$(backend_container_id_any_state "${service}" || true)"
    if [[ -z "${cid}" ]]; then
      continue
    fi

    status="$(docker inspect --format '{{.State.Status}}' "${cid}" 2>/dev/null || echo "unknown")"
    restarting="$(docker inspect --format '{{.State.Restarting}}' "${cid}" 2>/dev/null || echo "unknown")"
    exit_code="$(docker inspect --format '{{.State.ExitCode}}' "${cid}" 2>/dev/null || echo "0")"
    restart_count="$(docker inspect --format '{{.RestartCount}}' "${cid}" 2>/dev/null || echo "0")"
    started_at="$(docker inspect --format '{{.State.StartedAt}}' "${cid}" 2>/dev/null || echo "")"

    reason=""
    if [[ "${restarting}" == "true" || "${status}" == "restarting" || "${status}" == "dead" ]]; then
      reason="state"
    elif [[ "${status}" == "exited" && "${exit_code}" != "0" ]]; then
      reason="exit"
    else
      # A container that dies instantly (autoheal exiting 127 on a tcp DOCKER_SOCK)
      # spends most of its restart backoff in "restarting", but a single sample can
      # land on the short-lived "running" window and look healthy. Pair a non-zero
      # RestartCount with a StartedAt from the current boot window to catch that
      # sample too; containers that restarted long ago (db_1 after a host reboot)
      # keep an old StartedAt and stay quiet.
      started_epoch="$(docker_timestamp_epoch "${started_at}")"
      if [[ "${restart_count}" =~ ^[0-9]+$ && "${restart_count}" -gt 0 && -n "${started_epoch}" && "${now_epoch}" -gt 0 ]]; then
        started_age=$((now_epoch - started_epoch))
        if [[ "${started_age}" -ge 0 && "${started_age}" -lt "${recent_start_seconds}" ]]; then
          reason="restart-churn"
        fi
      fi
    fi

    if [[ -z "${reason}" ]]; then
      continue
    fi

    unstable=$((unstable + 1))
    echo "WARN ${service} is not stable after boot: status=${status} restarting=${restarting} exit=${exit_code} restarts=${restart_count} reason=${reason}" >&2
    run_diagnostic_command docker inspect --format "${service} image={{.Config.Image}} status={{.State.Status}} restarting={{.State.Restarting}} restart={{.RestartCount}} exit={{.State.ExitCode}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}" "${cid}" >&2 || true
    run_compose_diagnostic logs --no-color --tail=40 "${service}" >&2 || true
  done

  if [[ "${unstable}" -gt 0 ]]; then
    echo "WARN ${unstable} infra/monitoring container(s) unstable after boot; backend deploy continues" >&2
    return 0
  fi

  echo "infra/monitoring containers stable after boot: $*"
  return 0
}

cloudflared_registration_log_exists() {
  local logs="$1"
  if echo "${logs}" | grep -Eqi 'Registered tunnel connection|Connection .* registered'; then
    return 0
  fi
  return 1
}

probe_cloudflared_public_readiness_code() {
  local web_domain="$1"
  local connect_timeout="${CLOUDFLARED_PUBLIC_CONNECT_TIMEOUT_SECONDS:-5}"
  local max_time="${CLOUDFLARED_PUBLIC_MAX_TIME_SECONDS:-15}"
  if [[ -z "${web_domain}" ]]; then
    echo ""
    return 0
  fi

  curl -sS \
    --connect-timeout "${connect_timeout}" \
    -m "${max_time}" \
    -o /dev/null \
    -w "%{http_code}" \
    "https://${web_domain}${HEALTHCHECK_PATH}" || true
}

check_cloudflared_public_readiness() {
  local web_domain="$1"
  local retries="${CLOUDFLARED_PUBLIC_READINESS_RETRIES:-5}"
  local sleep_seconds="${CLOUDFLARED_PUBLIC_READINESS_SLEEP_SECONDS:-2}"
  local attempt=1
  local code

  if [[ -z "${web_domain}" ]]; then
    echo "skip cloudflared public readiness: WEB_DOMAIN is empty"
    return 0
  fi

  while [[ "${attempt}" -le "${retries}" ]]; do
    code="$(probe_cloudflared_public_readiness_code "${web_domain}")"
    if is_healthy_http_code "${code}"; then
      echo "cloudflared public readiness ok: domain=${web_domain} status=${code} attempt=${attempt}/${retries}"
      return 0
    fi

    echo "cloudflared public readiness pending: domain=${web_domain} status=${code:-none} attempt=${attempt}/${retries}" >&2
    sleep "${sleep_seconds}"
    attempt=$((attempt + 1))
  done

  echo "cloudflared public readiness failed: domain=${web_domain} status=${code:-none} attempts=${retries}" >&2
  return 1
}

check_cloudflared_runtime() {
  local web_domain="${1:-}"
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
    if check_cloudflared_public_readiness "${web_domain}"; then
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

    if ! check_cloudflared_public_readiness "${web_domain}"; then
      echo "cloudflared runtime verify failed after restart" >&2
      echo "${cf_logs}" >&2
      return 1
    fi
  fi

  echo "cloudflared runtime check ok: status=${status}, restart_count=${restart_count}, registration=${has_registration_log}"
}

# CRLF로 저장된 .env.prod에서는 값 끝에 \r이 남는다. trim_quotes가 그 뒤에 돌면 마지막 문자가
# \r이라 닫는 따옴표를 못 떼고 `front"` 같은 값이 나온다. COMPOSE_PROFILES면 프로필이 조용히
# 비활성화되고, 비밀번호·키면 인증이 깨진다. 읽는 지점에서 없앤다
# (rollback_last_deploy.sh의 env_value와 deploy.yml의 extract_env_value_from_text가 쓰는 방식).
env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      print value
      exit
    }
  ' "${ENV_FILE}"
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
  docker run --rm --network "${OBSERVE_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://grafana:3000/api/health" 2>/dev/null || true
}

probe_grafana_embed_origin_headers() {
  local web_domain="$1"
  local grafana_domain="$2"
  local path="$3"
  local admin_email="$4"
  local admin_password="$5"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
    set -eu
    web_domain="$1"
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
        -H "Host: ${web_domain}" \
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
  ' sh "${web_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}" 2>/dev/null || true
}

check_grafana_embed_origin_route() {
  local web_domain grafana_domain path admin_email admin_password
  web_domain="$(trim_quotes "$(env_value "WEB_DOMAIN")")"
  grafana_domain="$(trim_quotes "$(env_value "GRAFANA_DOMAIN")")"
  path="$(monitoring_embed_candidate_path)"
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${grafana_domain}" ]]; then
    echo "skip grafana origin route check: no GRAFANA_DOMAIN configured"
    return 0
  fi
  if [[ -z "${web_domain}" || -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "skip grafana origin route check: missing WEB_DOMAIN or admin credentials"
    return 0
  fi

  local attempts=20
  local sleep_seconds=3
  local try=1
  local headers status location xfo csp internal_health

  while (( try <= attempts )); do
    internal_health="$(probe_grafana_internal_health)"
    headers="$(probe_grafana_embed_origin_headers "${web_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}")"
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
  upsert_env_key "CUSTOM__RUNTIME__API_MODE_WORKER" "none"

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
  local blue_min=704
  local read_min=832
  local admin_min=896
  local worker_min=1024
  local blue
  local read
  local admin
  local worker
  local total

  blue="$(scaled_limit_mb 704 "${budget_mb}" 4096 "${blue_min}")"
  read="$(scaled_limit_mb 832 "${budget_mb}" 4096 "${read_min}")"
  admin="$(scaled_limit_mb 896 "${budget_mb}" 4096 "${admin_min}")"
  worker="$(scaled_limit_mb 896 "${budget_mb}" 4096 "${worker_min}")"

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
    mode_min_budget_mb=4160
  fi

  if (( AUTO_MEMORY_TUNER_MAX_BUDGET_MB < mode_min_budget_mb )); then
    echo "auto-memory-tuner guard: invalid max budget (max_budget_mb=${AUTO_MEMORY_TUNER_MAX_BUDGET_MB} < mode_min_budget_mb=${mode_min_budget_mb})" >&2
    return 1
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
  require_nonempty_env_key "WEB_DOMAIN"
  require_nonempty_env_key "CF_TUNNEL_TOKEN"
  require_nonempty_env_key "PROD___SPRING__DATASOURCE__USERNAME"
  require_nonempty_env_key "PROD___SPRING__DATASOURCE__PASSWORD"
  require_nonempty_env_key "PROD___POSTGRES__PASSWORD"
  ensure_image_env_key_from_local_digest "CLOUDFLARED_IMAGE" "cloudflare/cloudflared:latest"
  ensure_image_env_key_from_local_digest "AUTOHEAL_IMAGE" "willfarrell/autoheal:latest"
  ensure_image_env_key_from_local_digest "DOCKER_SOCKET_PROXY_IMAGE" "tecnativa/docker-socket-proxy:0.3.0"
  ensure_image_env_key_from_local_digest "CADDY_IMAGE" "caddy:2.8-alpine"
  ensure_image_env_key_from_local_digest "UPTIME_KUMA_IMAGE" "louislam/uptime-kuma:1"
  ensure_image_env_key_from_local_digest "PROMETHEUS_IMAGE" "prom/prometheus:v2.54.1"
  ensure_image_env_key_from_local_digest "ALERTMANAGER_IMAGE" "prom/alertmanager:v0.27.0"
  ensure_image_env_key_from_local_digest "POSTGRES_EXPORTER_IMAGE" "quay.io/prometheuscommunity/postgres-exporter:v0.20.1"
  ensure_image_env_key_from_local_digest "GRAFANA_IMAGE" "grafana/grafana:11.2.2"
  ensure_image_env_key_from_local_digest "LOKI_IMAGE" "grafana/loki:3.0.0"
  ensure_image_env_key_from_local_digest "PROMTAIL_IMAGE" "grafana/promtail:3.0.0"
  ensure_image_env_key_from_local_digest "NODE_RUNTIME_IMAGE" "node:20-alpine"
  ensure_image_env_key_from_local_digest "DB_IMAGE" "jangka512/pgj:latest"
  ensure_image_env_key_from_local_digest "REDIS_IMAGE" "redis:7-alpine"
  require_digest_image_env_key "CLOUDFLARED_IMAGE"
  require_digest_image_env_key "AUTOHEAL_IMAGE"
  require_digest_image_env_key "DOCKER_SOCKET_PROXY_IMAGE"
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
  require_digest_image_env_key "MINIO_MC_IMAGE"
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
  local runtime_user flyway_user flyway_password
  runtime_user="$(trim_quotes "$(env_value "PROD___SPRING__DATASOURCE__USERNAME")")"
  flyway_user="$(trim_quotes "$(env_value "PROD___SPRING__FLYWAY__USER")")"
  flyway_password="$(trim_quotes "$(env_value "PROD___SPRING__FLYWAY__PASSWORD")")"

  if [[ -z "${runtime_user}" ]]; then
    echo "runtime datasource user must be set (PROD___SPRING__DATASOURCE__USERNAME)" >&2
    return 1
  fi
  if [[ "${runtime_user}" == "postgres" ]]; then
    echo "runtime datasource user must not be postgres" >&2
    return 1
  fi
  if [[ -z "${flyway_user}" ]]; then
    echo "flyway user must be set (PROD___SPRING__FLYWAY__USER); postgres/superuser fallback is forbidden" >&2
    return 1
  fi
  if [[ "${flyway_user}" == "postgres" ]]; then
    echo "flyway user must not be postgres superuser (PROD___SPRING__FLYWAY__USER)" >&2
    return 1
  fi
  if [[ "${runtime_user}" == "${flyway_user}" ]]; then
    echo "runtime datasource user and flyway user must be separated" >&2
    return 1
  fi
  if [[ -z "${flyway_password}" ]]; then
    echo "flyway password must be set (PROD___SPRING__FLYWAY__PASSWORD); postgres password fallback is forbidden" >&2
    return 1
  fi
}

validate_postgres_exporter_env() {
  local exporter_user exporter_password
  exporter_user="$(trim_quotes "$(env_value "PROD___POSTGRES_EXPORTER__USERNAME")")"
  exporter_password="$(trim_quotes "$(env_value "PROD___POSTGRES_EXPORTER__PASSWORD")")"
  if [[ -z "${exporter_user}" ]]; then
    exporter_user="postgres_exporter"
  fi
  if [[ -z "${exporter_password}" ]]; then
    echo "postgres exporter password must be set (PROD___POSTGRES_EXPORTER__PASSWORD)" >&2
    return 1
  fi
  if [[ "${exporter_user}" == "postgres" ]]; then
    echo "postgres exporter user must not be postgres" >&2
    return 1
  fi
  if ! [[ "${exporter_user}" =~ ^[a-z_][a-z0-9_]*$ ]]; then
    echo "postgres exporter user must match postgres identifier pattern: ${exporter_user}" >&2
    return 1
  fi
}

provision_postgres_exporter_role() {
  local exporter_user exporter_password sql_file
  exporter_user="$(trim_quotes "$(env_value "PROD___POSTGRES_EXPORTER__USERNAME")")"
  exporter_password="$(trim_quotes "$(env_value "PROD___POSTGRES_EXPORTER__PASSWORD")")"
  if [[ -z "${exporter_user}" ]]; then
    exporter_user="postgres_exporter"
  fi
  sql_file="${SCRIPT_DIR}/sql/provision_postgres_exporter_role.sql"

  if [[ -z "${exporter_password}" ]]; then
    echo "postgres exporter credential is incomplete" >&2
    return 1
  fi
  if [[ ! -f "${sql_file}" ]]; then
    echo "missing exporter role SQL: ${sql_file}" >&2
    return 1
  fi

  if compose exec -T db_1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -v exporter_user="${exporter_user}" \
    -v exporter_password="${exporter_password}" \
    -f - < "${sql_file}" >/dev/null 2>&1; then
    echo "postgres exporter role provisioned: user=${exporter_user} (pg_monitor)"
    return 0
  fi

  echo "postgres exporter role provision failed" >&2
  return 1
}

provision_db_runtime_role() {
  local runtime_user runtime_password flyway_user flyway_password db_name sql_file psql_err
  runtime_user="$(trim_quotes "$(env_value "PROD___SPRING__DATASOURCE__USERNAME")")"
  runtime_password="$(trim_quotes "$(env_value "PROD___SPRING__DATASOURCE__PASSWORD")")"
  flyway_user="$(trim_quotes "$(env_value "PROD___SPRING__FLYWAY__USER")")"
  flyway_password="$(trim_quotes "$(env_value "PROD___SPRING__FLYWAY__PASSWORD")")"
  db_name="$(resolve_prod_db_name)"
  sql_file="${SCRIPT_DIR}/sql/provision_db_runtime_role.sql"

  validate_db_runtime_role_env || return 1

  if [[ -z "${runtime_password}" ]]; then
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
  if [[ ! -f "${sql_file}" ]]; then
    echo "missing runtime role SQL: ${sql_file}" >&2
    return 1
  fi

  # Capture stderr for Deploy logs; keep success path quiet. Never echo password values.
  if psql_err="$(compose exec -T db_1 psql -U postgres -d "${db_name}" -v ON_ERROR_STOP=1 \
    -v runtime_user="${runtime_user}" \
    -v runtime_password="${runtime_password}" \
    -v migration_user="${flyway_user}" \
    -v migration_password="${flyway_password}" \
    -f - < "${sql_file}" 2>&1 >/dev/null)"; then
    echo "runtime role provisioned in ${db_name}: runtime=${runtime_user}, migration=${flyway_user}"
    return 0
  fi

  echo "runtime role provision failed in ${db_name}" >&2
  if [[ -n "${psql_err}" ]]; then
    printf '%s\n' "${psql_err}" >&2
  fi
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

# Any reverse_proxy/forward_auth line that targets a literal colour host instead of a
# {$READ_API_UPSTREAM}/{$ADMIN_API_UPSTREAM} placeholder. Under runtime-split such a line
# wins over the env value and takes its routes out of the split. This sees every upstream
# line, so it also catches a partial drift that the single-token route verification misses.
caddy_file_has_literal_colour_upstream() {
  grep -Eq '^[[:space:]]*(reverse_proxy|forward_auth)[[:space:]]+back[-_](blue|green|active):8080([[:space:]]|$)' "${CADDY_FILE}"
}

# State the outcome a literal drift actually produces, because the two possible outcomes
# differ and neither is what the plain "kept on placeholders" line would suggest.
# verify_caddy_route() compares a single token (the first reverse_proxy upstream), so a
# drift that reaches that token makes this cutover fail and roll back, while a drift that
# spares it lets the cutover report success with those routes outside the split.
#
# The file is not repaired here. The literal -> placeholder direction is not recoverable
# from the file alone (both upstream keys collapse to the same literal), and rebuilding it
# from route context would copy the Caddyfile's routing policy into this script, where a
# newly added read route would silently be wired to the admin runtime. Restoring the repo
# Caddyfile is deploy.yml's `git checkout --force`, which runs before this script.
report_caddy_split_literal_drift() {
  local backend="$1"
  local expected_host current_host

  echo "WARN caddy upstream has literal colour hosts under runtime-split; env routing (read=$(host_env_value "READ_API_UPSTREAM"), admin=$(host_env_value "ADMIN_API_UPSTREAM")) is not in effect for those routes" >&2
  grep -nE '^[[:space:]]*(reverse_proxy|forward_auth)[[:space:]]+back[-_](blue|green|active):8080' "${CADDY_FILE}" >&2 || true

  if ! expected_host="$(expected_caddy_upstream_host "${backend}")"; then
    echo "WARN this cutover fails at caddy route verify: the runtime-split upstream expectation cannot be resolved" >&2
    return 0
  fi

  current_host="$(current_caddy_upstream_host)"
  if [[ "${current_host}" != "${expected_host}" ]]; then
    echo "WARN this cutover cannot succeed: caddy route verify compares current=${current_host:-none} against expected=${expected_host}, so it fails after 20 tries and the deploy rolls back to the previous backend" >&2
    return 0
  fi

  echo "WARN this cutover still passes caddy route verify (current=${current_host}): it reports success while the upstream lines above stay outside runtime-split read/admin isolation until the placeholder Caddyfile is restored" >&2
}

set_caddy_upstream_backend() {
  local backend="$1"
  local active_host
  active_host="$(backend_http_host "${backend}")"

  # runtime-split: edge upstreams belong to configure_runtime_split_env()
  # (READ_API_UPSTREAM=back_read, ADMIN_API_UPSTREAM=back_admin). Baking the active
  # colour into the Caddyfile makes the literal win over the env placeholder and
  # collapses read/admin isolation into a single blue/green container (#1418), so the
  # whole rewrite stays out of split mode. Caddy runs without --watch, so the reload
  # is still required: deploy.yml restores the repo Caddyfile with `git checkout
  # --force` and the running config would otherwise keep the previous upstreams.
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    reload_caddy
    if caddy_file_has_literal_colour_upstream; then
      report_caddy_split_literal_drift "${backend}"
      return 0
    fi
    echo "caddy upstream kept on runtime-split placeholders: read=$(host_env_value "READ_API_UPSTREAM"), admin=$(host_env_value "ADMIN_API_UPSTREAM") (cutover colour=${active_host})"
    return 0
  fi

  upsert_env_key "ADMIN_API_UPSTREAM" "${active_host}"
  upsert_env_key "READ_API_UPSTREAM" "${active_host}"

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

# Upstream host the edge must serve after a cutover. In runtime-split mode the edge
# never points at a colour, so the expectation comes from ADMIN_API_UPSTREAM: that is
# the key behind the first `reverse_proxy` token current_caddy_upstream_host() reads
# and behind the default handle that HEALTHCHECK_PATH resolves through.
expected_caddy_upstream_host() {
  local backend="$1"
  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    backend_http_host "${backend}"
    return
  fi

  local upstream
  upstream="$(normalize_backend_name "$(host_env_value "ADMIN_API_UPSTREAM")")"
  if [[ -z "${upstream}" ]]; then
    echo "runtime-split enabled but ADMIN_API_UPSTREAM is missing in ${ENV_FILE}" >&2
    return 1
  fi
  echo "${upstream}"
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
  local web_domain="$1"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" "http://caddy:80${HEALTHCHECK_PATH}" \
    -H "Host: ${web_domain}" || true
}

probe_caddy_route_http_code() {
  local web_domain="$1"
  local path="$2"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${PREWARM_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${PREWARM_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" "http://caddy:80${path}" \
    -H "Host: ${web_domain}" || true
}

prewarm_public_read_cache() {
  local web_domain="$1"
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
      code="$(probe_caddy_route_http_code "${web_domain}" "${path}")"
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
        -H "Host: ${web_domain}" || true)"
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
    -H "Host: ${web_domain}" || true)"
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
    -H "Host: ${web_domain}" || true)"
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
    -H "Host: ${web_domain}" || true)"
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
      docker run --rm --network "${APP_NETWORK_NAME}" curlimages/curl:8.7.1 \
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
  local web_domain="$1"
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
      web_domain="$1"
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
          -H "Host: ${web_domain}" \
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
          -H "Host: ${web_domain}" \
          -o "${stream_body_file}" \
          -w "%{http_code}" \
          "http://caddy:80/member/api/v1/notifications/stream" || true
      )"
      echo "stream_status=${stream_status}"
      tr -d "\r" < "${stream_body_file}"
    ' sh "${web_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
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
  local web_domain="$2"
  local expected_host
  if ! expected_host="$(expected_caddy_upstream_host "${expected_backend}")"; then
    return 1
  fi

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
      code="$(probe_caddy_http_code "${web_domain}")"
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
  local web_domain="$3"

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

  # runtime-split에서 edge 트래픽의 실제 목적지는 back_read/back_admin이다. 즉
  # verify_caddy_route()가 프로브하는 컨테이너가 곧 helper 복구 대상이므로, 후보 이미지가 원인인
  # 실패에서는 복구 전 verify가 통과할 수 없다. verify를 먼저 두면 rollback이 복구 앞에서
  # 중단되고 프로덕션이 깨진 이미지에 고착된다(#1418, #1409와 동일 클래스). 그래서 split에서는
  # 복구를 먼저 하고 verify를 그 결과에 대한 사후 검증으로 돌린다. 복구는 Caddy 라우트 상태에
  # 의존하지 않고(활성 색 이미지 값 + 자체 healthcheck만 본다) 활성 색은 위에서 이미
  # running/DNS/health로 확인했으므로 앞으로 옮겨도 전제가 깨지지 않는다. 단일 런타임 helper는
  # back_worker뿐이고 edge 경로가 아니므로 기존 순서(verify -> 복구)를 유지한다.
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    if ! restore_runtime_split_helper_backends_to_active "${previous_backend}" "${candidate_backend}"; then
      echo "burn-in rollback failed: helper recovery failed before route verify" >&2
      compose stop "${candidate_backend}" || true
      return 1
    fi
  fi

  if ! verify_caddy_route "${previous_backend}" "${web_domain}"; then
    echo "burn-in rollback failed: caddy route verify failed" >&2
    return 1
  fi

  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    if ! restore_runtime_split_helper_backends_to_active "${previous_backend}" "${candidate_backend}"; then
      echo "burn-in rollback failed: helper recovery failed after route rollback" >&2
      compose stop "${candidate_backend}" || true
      return 1
    fi
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
  local web_domain="$3"
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
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${web_domain}" || true
      return 1
    fi

    if ! verify_caddy_route "${candidate_backend}" "${web_domain}"; then
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${web_domain}" || true
      return 1
    fi

    post_code="$(probe_caddy_http_code "${web_domain}")"
    if ! is_healthy_http_code "${post_code}"; then
      echo "burn-in public route verify failed (status=${post_code:-none})" >&2
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${web_domain}" || true
      return 1
    fi

    if ! check_notification_sse_route "${web_domain}"; then
      echo "burn-in notification sse verify failed" >&2
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${web_domain}" || true
      return 1
    fi

    if ! check_cloudflared_runtime "${web_domain}"; then
      echo "burn-in cloudflared runtime verify failed" >&2
      rollback_caddy_route_only "${previous_backend}" "${candidate_backend}" "${web_domain}" || true
      return 1
    fi

  done

  echo "burn-in ok: candidate=${candidate_backend}, previous=${previous_backend}, duration_seconds=${duration_seconds}"
  return 0
}

rollback_to_backend() {
  local rollback_backend="$1"
  local web_domain="$2"

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

  # split에서 helper 복구가 route verify 앞에 오는 이유는 rollback_caddy_route_only() 주석 참조:
  # verify의 프로브 대상(back_admin)이 곧 복구 대상이라 복구 전에는 통과할 수 없다.
  if [[ "${RUNTIME_SPLIT_ENABLED}" == "true" ]]; then
    if ! restore_runtime_split_helper_backends_to_active "${rollback_backend}" "${inactive_backend}"; then
      echo "rollback failed: helper recovery failed before route verify" >&2
      return 1
    fi
  fi

  if ! verify_caddy_route "${rollback_backend}" "${web_domain}"; then
    echo "rollback failed: caddy route verify failed" >&2
    return 1
  fi

  if [[ "${RUNTIME_SPLIT_ENABLED}" != "true" ]]; then
    if ! restore_runtime_split_helper_backends_to_active "${rollback_backend}" "${inactive_backend}"; then
      echo "rollback failed: helper recovery failed after route rollback" >&2
      return 1
    fi
  fi

  echo "${rollback_backend}" > "${STATE_FILE}"
  write_backend_release_state "${rollback_backend}" "${inactive_backend}"
  drain_and_stop_backend_if_running "${inactive_backend}"
  return 0
}

# ---------------------------------------------------------------------------
# front blue/green (#1539)
#
# 백엔드와 같은 순서를 따른다: 이미지 pull -> 대기 색 기동 -> health 통과 확인 -> Caddy upstream
# 전환 -> 검증 -> 이전 색 정리. 다른 점은 두 가지뿐이다.
#   1. edge upstream 키가 WEB_UPSTREAM(:3000)이고 Caddyfile 토큰이 backend와 분리돼 있다.
#   2. "컨테이너가 떴다"가 아니라 "edge가 그 빌드를 서빙한다"까지 확인한다. front/src/pages/
#      _document.tsx가 <meta name="aquila-build-sha">를 렌더하므로 서빙 중인 산출물이 어느
#      커밋에서 나왔는지 응답만 보고 판정할 수 있다. rollback도 같은 신호로 판정한다.
# ---------------------------------------------------------------------------

front_image_key() {
  local service="$1"
  case "${service}" in
    front_blue) echo "FRONT_BLUE_IMAGE" ;;
    front_green) echo "FRONT_GREEN_IMAGE" ;;
    *)
      echo "unknown front runtime service: ${service}" >&2
      return 1
      ;;
  esac
}

other_front() {
  local service="$1"
  if [[ "${service}" == "front_blue" ]]; then
    echo "front_green"
    return
  fi
  echo "front_blue"
}

runtime_front_image_value() {
  local service="$1"
  local key
  key="$(front_image_key "${service}")" || return 1
  trim_quotes "$(env_value "${key}")"
}

upsert_runtime_front_image() {
  local service="$1"
  local image="$2"
  local key
  key="$(front_image_key "${service}")" || return 1
  require_digest_image_value "${key}" "${image}" || return 1
  upsert_env_key "${key}" "${image}"
}

# compose를 부르지 않는다. front 프로필이 켜진 채 FRONT_*_IMAGE가 비어 있으면 `docker compose`가
# "neither an image nor a build context"로 죽기 때문에, 이미지 값을 채우기 전 단계에서는 compose
# 대신 컨테이너 라벨로만 상태를 본다.
front_service_running() {
  local service="$1"
  local cid
  cid="$(
    docker ps -q \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
      --filter "label=com.docker.compose.service=${service}" 2>/dev/null | head -n 1 || true
  )"
  [[ -n "${cid}" ]]
}

front_container_health() {
  local service="$1"
  local cid
  cid="$(backend_container_id_any_state "${service}")"
  if [[ -z "${cid}" ]]; then
    echo "none"
    return 0
  fi
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

# backend와 달리 front는 두 색을 상시 유지한다(cutover 뒤에도 이전 색을 warm rollback 대상으로
# 남기고, backend 배포는 두 색을 모두 기동한다). 그래서 "실행 중인 색"은 두 색을 구분하지 못하고
# 1차 신호가 될 수 없다 — 실효 신호는 상태 파일 하나다.
#
# 상태 파일은 untracked라 유실될 수 있으므로(서버 재구축, 수동 정리) 그 다음 신호로 **지금 edge가
# 실제로 프록시하는 색**을 읽는다. 그것이 "마지막으로 검증된 색"의 관측 가능한 근거다. 두 신호가
# 모두 없을 때만 실행 중인 색으로, 그것도 없으면 Caddyfile 기본값과 같은 front_blue로 떨어진다.
detect_active_front() {
  local from_state=""
  if [[ -f "${FRONT_STATE_FILE}" ]]; then
    from_state="$(tr -d '[:space:]' < "${FRONT_STATE_FILE}" || true)"
  fi
  if [[ "${from_state}" == "front_blue" || "${from_state}" == "front_green" ]]; then
    echo "${from_state}"
    return
  fi

  # caddy가 아직 뜨지 않은 단계(backend 배포의 edge boot 전)에서는 빈 값이 온다. 실패해도
  # 다음 신호로 넘어갈 뿐이라 여기서 배포를 멈추지 않는다.
  local from_edge=""
  from_edge="$(current_caddy_web_upstream_host 2>/dev/null || true)"
  if [[ "${from_edge}" == "front_blue" || "${from_edge}" == "front_green" ]]; then
    echo "${from_edge}"
    return
  fi

  local blue_running="false"
  local green_running="false"
  if front_service_running "front_blue"; then blue_running="true"; fi
  if front_service_running "front_green"; then green_running="true"; fi
  if [[ "${blue_running}" == "true" && "${green_running}" != "true" ]]; then
    echo "front_blue"
    return
  fi
  if [[ "${green_running}" == "true" && "${blue_running}" != "true" ]]; then
    echo "front_green"
    return
  fi
  echo "front_blue"
}

resolve_preserved_front_image() {
  local service="$1"
  local image
  image="$(runtime_front_image_value "${service}")" || return 1
  if [[ -n "${image}" ]]; then
    echo "${image}"
    return 0
  fi
  container_image_for_service_any_state "${service}" || true
}

# 이 배포가 front 이미지를 바꾸지 않을 때(backend rollout)도 두 색 모두 유효한 digest를 가져야
# compose 평가가 통과한다. .env.prod는 매 배포마다 HOME_SERVER_ENV로 덮여 쓰이므로, 값이 사라진
# 경우 실행 중인 컨테이너의 이미지를 복원한다(backend의 resolve_preserved_backend_image와 같은 이유).
prepare_front_runtime_images() {
  if ! compose_profile_enabled "front"; then
    echo "front profile disabled: skip front image preparation"
    return 0
  fi

  local service image
  for service in front_blue front_green; do
    image="$(resolve_preserved_front_image "${service}")" || return 1
    if [[ -z "${image}" ]]; then
      echo "front profile is enabled but no image is available for ${service}: set FRONT_BLUE_IMAGE/FRONT_GREEN_IMAGE in HOME_SERVER_ENV or run a front deploy first" >&2
      return 1
    fi
    upsert_runtime_front_image "${service}" "${image}" || return 1
  done
  echo "front runtime image map prepared: front_blue=$(runtime_front_image_value front_blue) front_green=$(runtime_front_image_value front_green)"
}

# Caddyfile의 web upstream 토큰을 한 색으로 고정한다. sed가 실패해 결과가 비면 Caddyfile을 통째로
# 비워 edge 전체가 죽으므로, 빈 결과는 쓰지 않고 실패로 끝낸다.
write_front_caddy_upstream_literal() {
  local colour="$1"
  local rewritten
  rewritten="$(sed -E \
    -e 's/\{\$WEB_UPSTREAM:front[-_](blue|green)\}:3000/'"${colour}"':3000/g' \
    -e 's/front[-_](blue|green):3000/'"${colour}"':3000/g' \
    "${CADDY_FILE}")"
  if [[ -z "${rewritten}" ]]; then
    echo "refusing to write an empty Caddyfile while pinning the front upstream to ${colour}" >&2
    return 1
  fi
  printf '%s\n' "${rewritten}" > "${CADDY_FILE}" || return 1
}

# env 키와 Caddyfile 리터럴을 함께 고정한다. 둘 중 하나만 맞으면 caddy가 설정을 다시 읽는 시점에
# 서로 다른 색으로 갈린다.
#
# 리터럴까지 쓰는 이유: caddy는 placeholder를 **컨테이너 생성 시점의 env**로 해석하고, 그 env는
# cutover 이후 갱신되지 않는다(cutover는 caddy를 재생성하지 않는다). 배포의 `git checkout --force`가
# 리터럴을 placeholder로 되돌린 상태로 남으면, 04:10 정기 재부팅이나 autoheal 재시작 한 번으로
# 공개 사이트가 조용히 이전 색으로 돌아간다 - 전부 200이고 아무 알림도 뜨지 않는다.
# 파일만 고친다: 실행 중인 caddy의 라우팅은 이미 같은 색이므로 reload가 필요 없고, caddy가 떠
# 있지 않은 단계(edge boot 전)에서도 성립해야 한다.
pin_front_caddy_upstream() {
  local colour="$1"
  upsert_env_key "WEB_UPSTREAM" "${colour}" || return 1
  write_front_caddy_upstream_literal "${colour}" || return 1
}

# WEB_UPSTREAM이 없으면 Caddy web vhost가 `{$WEB_UPSTREAM:front_blue}` 기본값으로 내려앉는다.
# .env.prod는 매 배포마다 재생성되므로, 활성 색이 green인 상태에서 backend 배포만 돌면 공개
# 트래픽이 조용히 멈춰 있는 blue로 넘어간다. caddy 컨테이너가 생성될 때 값을 갖도록 boot 전에 핀한다.
persist_front_caddy_upstream() {
  if ! compose_profile_enabled "front"; then
    echo "front profile disabled: skip web upstream pin"
    return 0
  fi

  local active
  active="$(detect_active_front)"
  pin_front_caddy_upstream "${active}" || return 1
  echo "front web upstream pinned before edge boot: WEB_UPSTREAM=${active} (Caddyfile literal restored)"
}

front_edge_host() {
  local host
  host="$(host_env_value "WEB_DOMAIN")"
  if [[ -n "${host}" ]]; then
    printf '%s' "${host}"
    return 0
  fi
  echo "WEB_DOMAIN is required for front edge verification" >&2
  return 1
}

probe_front_http_code() {
  local service="$1"
  local path="$2"
  docker run --rm --network "${APP_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${FRONT_HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${FRONT_HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" \
    "http://${service}:3000${path}" || true
}

probe_web_edge_http_code() {
  local web_host="$1"
  local path="$2"
  docker run --rm --network "${EDGE_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${FRONT_HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${FRONT_HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" \
    -H "Host: ${web_host}" \
    "http://caddy:80${path}" || true
}

# edge가 지금 어느 빌드를 서빙하는지. 값이 비면 "확인 실패"이지 "통과"가 아니다 — 호출부가
# 빈 값을 성공으로 처리하지 않도록 판정은 전부 호출부에 있다.
served_front_build_sha() {
  local web_host="$1"
  docker run --rm --network "${EDGE_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${FRONT_HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${FRONT_HEALTHCHECK_MAX_TIME_SECONDS}" \
    -sS \
    -H "Host: ${web_host}" \
    "http://caddy:80${FRONT_RENDER_PATH}" 2>/dev/null \
    | grep -oE 'name="aquila-build-sha"[[:space:]]+content="[^"]*"' \
    | head -n 1 \
    | sed -E 's/.*content="([^"]*)".*/\1/' || true
}

check_front_health() {
  local service="$1"
  local attempt=1
  local health liveness_code render_code proxy_code
  # 시도 횟수만으로는 상한이 정해지지 않는다(프로브 timeout이 시도 길이를 좌우한다). job timeout에
  # 잘리면 rollback 없이 끝나므로 벽시계 예산을 함께 건다.
  local started_at deadline_at now
  started_at="$(date -u +%s)"
  deadline_at=$((started_at + FRONT_HEALTHCHECK_DEADLINE_SECONDS))

  while [[ "${attempt}" -le "${FRONT_HEALTHCHECK_RETRIES}" ]]; do
    now="$(date -u +%s)"
    if (( now >= deadline_at )); then
      echo "front healthcheck deadline reached after ${FRONT_HEALTHCHECK_DEADLINE_SECONDS}s: ${service} (attempt ${attempt}/${FRONT_HEALTHCHECK_RETRIES})" >&2
      break
    fi
    health="$(front_container_health "${service}")"
    liveness_code="$(probe_front_http_code "${service}" "${FRONT_LIVENESS_PATH}")"
    if [[ "${health}" == "healthy" ]] && is_healthy_http_code "${liveness_code}"; then
      # liveness는 tracked 정적 파일만 증명한다. 공개 트래픽이 닿는 것은 렌더 경로이므로
      # cutover 게이트는 SSR 응답까지 요구한다.
      render_code="$(probe_front_http_code "${service}" "${FRONT_RENDER_PATH}")"
      # 렌더 경로도 부족하다. 홈은 빌드 타임 프리렌더라 BACKEND_INTERNAL_URL이 비어 있어도
      # 200이고, 그 상태에서 브라우저가 실제로 쓰는 backend 프록시만 502였다(실측).
      proxy_code="$(probe_front_http_code "${service}" "${FRONT_BACKEND_PROXY_PATH}")"
      if is_healthy_http_code "${render_code}" && is_healthy_http_code "${proxy_code}"; then
        echo "front healthcheck ok: ${service} (health=${health}, liveness=${liveness_code}, render=${render_code}, backend_proxy=${proxy_code})"
        return 0
      fi
      echo "front render/proxy pending: ${service} (try ${attempt}/${FRONT_HEALTHCHECK_RETRIES}, render=${render_code:-none}, backend_proxy=${proxy_code:-none})"
    else
      echo "front healthcheck pending: ${service} (try ${attempt}/${FRONT_HEALTHCHECK_RETRIES}, health=${health:-none}, liveness=${liveness_code:-none})"
    fi

    sleep "${FRONT_HEALTHCHECK_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done

  echo "front healthcheck failed: ${service}" >&2
  emit_backend_diagnostics "${service}" >&2 || true
  return 1
}

resolve_caddy_web_upstream_token() {
  local token="$1"

  if [[ "${token}" =~ ^([a-zA-Z0-9_-]+):3000$ ]]; then
    normalize_backend_name "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "${token}" =~ ^\{\$WEB_UPSTREAM:([a-zA-Z0-9_-]+)\}:3000$ ]]; then
    local default_value resolved_value
    default_value="$(normalize_backend_name "${BASH_REMATCH[1]}")"
    resolved_value="$(normalize_backend_name "$(mounted_env_value "WEB_UPSTREAM")")"
    if [[ -n "${resolved_value}" ]]; then
      echo "${resolved_value}"
      return 0
    fi
    echo "${default_value}"
    return 0
  fi

  return 1
}

# 호스트 파일이 아니라 caddy가 실제로 마운트한 파일을 읽는다. placeholder가 남아 있으면 컨테이너
# 안의 env로 해석하므로, 두 경우 모두 "지금 caddy가 프록시하는 색"을 그대로 돌려준다.
current_caddy_web_upstream_host() {
  local token
  token="$(compose exec -T caddy awk '$1 == "reverse_proxy" && $2 ~ /^(front[-_](blue|green):3000|\{\$WEB_UPSTREAM:front[-_](blue|green)\}:3000)$/ {print $2; exit}' "${CADDY_CONTAINER_FILE}" 2>/dev/null | tr -d '\r' | head -n 1)"
  resolve_caddy_web_upstream_token "${token}" || true
}

# backend의 set_caddy_upstream_backend와 같은 방식: env 키와 Caddyfile 리터럴을 함께 바꾼다.
# caddy는 컨테이너 생성 시점의 env로 placeholder를 해석하므로, 리터럴을 쓰지 않으면 caddy를
# 재생성해야만 색이 바뀐다(= edge 연결 끊김). 리터럴 rewrite + reload는 무중단이고, 함께 쓴
# WEB_UPSTREAM은 다음 checkout으로 placeholder가 돌아왔을 때의 값이 된다.
switch_caddy_web_upstream() {
  local colour="$1"

  if ! resolve_in_caddy "${colour}"; then
    echo "caddy dns resolve failed: ${colour}" >&2
    return 1
  fi

  pin_front_caddy_upstream "${colour}" || return 1

  if ! reload_caddy; then
    echo "caddy reload failed while switching the web upstream to ${colour}" >&2
    return 1
  fi
  echo "caddy web upstream switched to ${colour}:3000"
  # backend의 switch_caddy_upstream과 같은 형태: mount sync가 마지막이라 그 실패가 그대로
  # 호출자에게 전달된다. echo를 마지막에 두면 reload/mount sync 실패가 성공이 된다.
  ensure_caddy_mount_sync
}

verify_front_edge_route() {
  local expected_colour="$1"
  local web_host="$2"
  local attempt=1
  local current code

  while [[ "${attempt}" -le "${FRONT_ROUTE_VERIFY_RETRIES}" ]]; do
    current="$(current_caddy_web_upstream_host)"
    if [[ "${current}" != "${expected_colour}" ]]; then
      echo "front upstream pending: current=${current:-none}, expected=${expected_colour} (try ${attempt}/${FRONT_ROUTE_VERIFY_RETRIES})"
    else
      code="$(probe_web_edge_http_code "${web_host}" "${FRONT_RENDER_PATH}")"
      if is_healthy_http_code "${code}"; then
        echo "front edge route verify ok: upstream=${expected_colour}, host=${web_host}, status=${code}"
        return 0
      fi
      echo "front edge route pending: status=${code:-none} (try ${attempt}/${FRONT_ROUTE_VERIFY_RETRIES})"
    fi

    sleep "${FRONT_ROUTE_VERIFY_INTERVAL_SECONDS}"
    attempt=$((attempt + 1))
  done

  echo "front edge route verify failed: expected upstream=${expected_colour}, host=${web_host}" >&2
  run_compose_diagnostic logs --no-color --tail=120 caddy >&2 || true
  return 1
}

write_front_release_state() {
  local active="$1"
  local previous="$2"
  local result="$3"
  local reason="$4"
  local switched_at="$5"
  local served_sha="$6"
  local pre_switch_sha="$7"

  # 기록 실패를 삼키면 다음 배포와 운영자가 "직전 성공 배포"의 낡은 증거를 현재 상태로 읽는다.
  if ! {
    printf 'front_active=%s\n' "${active}"
    printf 'front_previous=%s\n' "${previous}"
    printf 'front_active_image=%s\n' "$(runtime_front_image_value "${active}")"
    printf 'front_previous_image=%s\n' "$(runtime_front_image_value "${previous}")"
    printf 'front_active_build_sha=%s\n' "${served_sha}"
    printf 'front_previous_build_sha=%s\n' "${pre_switch_sha}"
    printf 'front_switched_at=%s\n' "${switched_at}"
    printf 'front_result=%s\n' "${result}"
    printf 'front_reason=%s\n' "${reason}"
  } > "${FRONT_RELEASE_STATE_FILE}"; then
    echo "failed to write the front release state file: ${FRONT_RELEASE_STATE_FILE}" >&2
    return 1
  fi

  echo "front release state: active=${active} active_image=$(runtime_front_image_value "${active}") previous=${previous} previous_image=$(runtime_front_image_value "${previous}") switched_at=${switched_at} served_build_sha=${served_sha:-none} previous_build_sha=${pre_switch_sha:-none} result=${result} reason=${reason:-none}"
}

# compose 보간 때문에 후보 digest는 pull/up **전에** .env.prod에 있어야 한다. 그래서 health 검사가
# 그 뒤에 오고, 실패해도 깨진 digest가 파일에 남는다. 그대로 두면 다음 backend 배포가 두 색을
# 모두 기동하면서 그 digest를 다시 띄우고(autoheal 재시작 루프), 배포는 성공으로 끝난다.
# 실패 시 후보 색의 값을 되돌린다. 되돌릴 이전 값이 없으면(후보가 처음 만들어지는 경우) 활성 색의
# 검증된 digest로 맞춘다 — 키를 비우면 front 프로필이 켜진 채 compose 평가가 깨진다.
restore_front_candidate_image() {
  local candidate="$1"
  local previous_candidate_image="$2"
  local active_image="$3"
  local restore_to="${previous_candidate_image}"

  if [[ -z "${restore_to}" ]]; then
    restore_to="${active_image}"
  fi
  if [[ -z "${restore_to}" ]]; then
    echo "cannot restore the front candidate image for ${candidate}: no known good digest" >&2
    return 1
  fi
  if ! upsert_runtime_front_image "${candidate}" "${restore_to}"; then
    echo "failed to restore the front candidate image for ${candidate}" >&2
    return 1
  fi
  echo "front candidate image restored after a failed rollout: ${candidate} -> ${restore_to}"
}

# cutover 전 실패 경로용. 활성 색은 그대로이므로 전환 시각은 없고, 서빙 중인 빌드는 cutover 직전에
# 관측한 값 그대로다. 이걸 남기지 않으면 직전 성공 배포의 `deployed`가 현재 상태처럼 남는다.
record_front_failure_state() {
  local active="$1"
  local candidate="$2"
  local reason="$3"
  local pre_switch_sha="$4"
  write_front_release_state "${active}" "${candidate}" "failed" "${reason}" "" "${pre_switch_sha}" "${pre_switch_sha}" || true
}

# 실패한 cutover를 이전 색으로 되돌린다. "컨테이너가 떴다"는 성공 근거가 아니므로 health ->
# route -> edge 200 -> 서빙 빌드 대조까지 통과해야 rollback 성공으로 본다. 하나라도 실패하면
# non-zero로 끝나 배포 전체가 실패로 보고된다.
rollback_front_to() {
  local previous="$1"
  local failed="$2"
  local reason="$3"
  local web_host="$4"
  local pre_switch_sha="$5"
  local rolled_back_at served_sha

  echo "front cutover failed (${reason}); rolling back to ${previous}" >&2

  # rollback이 어느 단계에서 멈추든 실패 사실이 파일에 남아야 한다. 남기지 않으면 직전 성공
  # 배포의 `deployed`가 현재 상태처럼 읽힌다.
  fail_rollback() {
    local detail="$1"
    echo "front rollback failed: ${detail}" >&2
    write_front_release_state "${previous}" "${failed}" "rollback_failed" "${reason}:${detail}" "" \
      "$(served_front_build_sha "${web_host}")" "${pre_switch_sha}" || true
    return 1
  }

  if ! front_service_running "${previous}"; then
    compose up -d "${previous}" || true
  fi

  if ! check_front_health "${previous}"; then
    fail_rollback "healthcheck failed for ${previous}"
    return 1
  fi

  if ! switch_caddy_web_upstream "${previous}"; then
    fail_rollback "caddy web upstream switch failed for ${previous}"
    return 1
  fi

  rolled_back_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if ! verify_front_edge_route "${previous}" "${web_host}"; then
    fail_rollback "edge route verify failed for ${previous}"
    return 1
  fi

  served_sha="$(served_front_build_sha "${web_host}")"
  if [[ -z "${served_sha}" ]]; then
    fail_rollback "edge did not report a build sha after rolling back to ${previous}"
    return 1
  fi
  if [[ -n "${pre_switch_sha}" && "${served_sha}" != "${pre_switch_sha}" ]]; then
    fail_rollback "edge serves build sha=${served_sha}, expected the pre-cutover build ${pre_switch_sha}"
    return 1
  fi

  printf '%s\n' "${previous}" > "${FRONT_STATE_FILE}" || {
    fail_rollback "cannot write the active front state file: ${FRONT_STATE_FILE}"
    return 1
  }
  write_front_release_state "${previous}" "${failed}" "rolled_back" "${reason}" "${rolled_back_at}" "${served_sha}" "${pre_switch_sha}" || return 1
  compose stop "${failed}" || true
  echo "front rollback ok: upstream=${previous}, served_build_sha=${served_sha}, stopped_candidate=${failed}"
  return 0
}

run_front_blue_green_deploy() {
  local active_front next_front active_image previous_candidate_image
  local web_host pre_switch_sha switched_at served_sha

  if ! compose_profile_enabled "front"; then
    echo "front profile is disabled: refusing front deploy" >&2
    return 1
  fi

  if [[ -z "${STAGED_FRONT_IMAGE}" ]]; then
    echo "STAGED_FRONT_IMAGE is empty. refusing front deploy to avoid an unpinned rollout." >&2
    return 1
  fi
  if ! require_digest_image_value "STAGED_FRONT_IMAGE" "${STAGED_FRONT_IMAGE}"; then
    return 1
  fi
  # 서빙 빌드 대조의 기준값이다. 없으면 "떴다"까지만 확인하게 되므로 fail closed 한다.
  if [[ ! "${STAGED_FRONT_BUILD_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "STAGED_FRONT_BUILD_SHA must be the 40-hex commit the front image was built from: '${STAGED_FRONT_BUILD_SHA}'" >&2
    return 1
  fi

  active_front="$(detect_active_front)"
  next_front="$(other_front "${active_front}")"
  web_host="$(front_edge_host)" || return 1

  active_image="$(resolve_preserved_front_image "${active_front}")" || return 1
  if [[ -z "${active_image}" ]]; then
    # 최초 rollout: 활성 색에 되돌아갈 이미지가 없으므로 두 색을 같은 digest로 맞춘다.
    active_image="${STAGED_FRONT_IMAGE}"
  fi
  # 실패 시 되돌릴 후보 색의 현재 값. 덮어쓰기 전에 잡아 둔다.
  previous_candidate_image="$(resolve_preserved_front_image "${next_front}")" || return 1
  upsert_runtime_front_image "${active_front}" "${active_image}" || return 1
  upsert_runtime_front_image "${next_front}" "${STAGED_FRONT_IMAGE}" || return 1
  # 후보가 뜨는 동안 edge는 활성 색에 고정돼 있어야 한다. 리터럴까지 함께 복구하는 이유는
  # pin_front_caddy_upstream 주석 참조 - 이 배포를 시작한 `git checkout --force`가 방금
  # Caddyfile을 placeholder로 되돌렸고, 여기서 복구하지 않으면 cutover 전에 실패했을 때
  # 다음 caddy 재시작이 공개 사이트를 조용히 이전 색으로 돌린다.
  pin_front_caddy_upstream "${active_front}" || return 1

  echo "front active colour: ${active_front} (image=${active_image})"
  echo "front next colour: ${next_front} (image=${STAGED_FRONT_IMAGE}, build_sha=${STAGED_FRONT_BUILD_SHA})"

  pre_switch_sha="$(served_front_build_sha "${web_host}")"
  echo "front pre-cutover served build sha: ${pre_switch_sha:-none} (host=${web_host})"

  if ! compose pull "${next_front}"; then
    echo "front candidate image pull failed: ${next_front} (${STAGED_FRONT_IMAGE})" >&2
    restore_front_candidate_image "${next_front}" "${previous_candidate_image}" "${active_image}" || true
    record_front_failure_state "${active_front}" "${next_front}" "front_candidate_pull_failed" "${pre_switch_sha}"
    return 1
  fi
  if ! compose_up_force_recreate_with_retry "${next_front}"; then
    emit_backend_diagnostics "${next_front}" >&2 || true
    compose stop "${next_front}" || true
    restore_front_candidate_image "${next_front}" "${previous_candidate_image}" "${active_image}" || true
    record_front_failure_state "${active_front}" "${next_front}" "front_candidate_boot_failed" "${pre_switch_sha}"
    return 1
  fi

  if ! check_front_health "${next_front}"; then
    echo "front candidate health failed before cutover: ${next_front}" >&2
    compose stop "${next_front}" || true
    restore_front_candidate_image "${next_front}" "${previous_candidate_image}" "${active_image}" || true
    record_front_failure_state "${active_front}" "${next_front}" "front_candidate_health_failed" "${pre_switch_sha}"
    return 1
  fi

  if ! switch_caddy_web_upstream "${next_front}"; then
    rollback_front_to "${active_front}" "${next_front}" "caddy_web_upstream_switch_failed" "${web_host}" "${pre_switch_sha}" || true
    restore_front_candidate_image "${next_front}" "${previous_candidate_image}" "${active_image}" || true
    return 1
  fi
  switched_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if ! verify_front_edge_route "${next_front}" "${web_host}"; then
    rollback_front_to "${active_front}" "${next_front}" "front_edge_route_verify_failed" "${web_host}" "${pre_switch_sha}" || true
    restore_front_candidate_image "${next_front}" "${previous_candidate_image}" "${active_image}" || true
    return 1
  fi

  served_sha="$(served_front_build_sha "${web_host}")"
  if [[ "${served_sha}" != "${STAGED_FRONT_BUILD_SHA}" ]]; then
    echo "front cutover verify failed: edge serves build sha=${served_sha:-none}, expected ${STAGED_FRONT_BUILD_SHA}" >&2
    rollback_front_to "${active_front}" "${next_front}" "front_served_build_sha_mismatch" "${web_host}" "${pre_switch_sha}" || true
    restore_front_candidate_image "${next_front}" "${previous_candidate_image}" "${active_image}" || true
    return 1
  fi

  # 상태·증거 기록 실패를 삼키면 다음 배포가 활성 색을 잘못 판정하고, 운영자는 이번 배포의
  # digest·전환 시각을 잃는다. 그 상태로 `deployed`를 보고하지 않는다.
  if ! printf '%s\n' "${next_front}" > "${FRONT_STATE_FILE}"; then
    echo "cannot write the active front state file: ${FRONT_STATE_FILE}" >&2
    return 1
  fi
  write_front_release_state "${next_front}" "${active_front}" "deployed" "" "${switched_at}" "${served_sha}" "${pre_switch_sha}" || return 1

  # 이전 색은 정지시키지 않는다. 트래픽은 받지 않지만 다음 배포가 실패했을 때 즉시 되돌릴 warm
  # rollback 대상이고, 정지시키면 그 rollback이 cold boot를 기다리는 동안 공개 사이트가 깨진
  # 빌드에 머문다. 실패한 후보만 정지시킨다(rollback_front_to).
  echo "front previous colour kept warm for rollback: ${active_front} (image=${active_image})"

  echo "front_deploy_result=deployed"
  echo "front cutover ok: upstream=${next_front}, image=${STAGED_FRONT_IMAGE}, served_build_sha=${served_sha}, switched_at=${switched_at}"
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

case "${DEPLOY_TARGET}" in
  backend | front) ;;
  *)
    echo "unsupported DEPLOY_TARGET: '${DEPLOY_TARGET}' (expected backend or front)" >&2
    exit 1
    ;;
esac

if ! acquire_deploy_lock; then
  exit 1
fi
trap 'resume_autoheal_if_paused; release_deploy_lock' EXIT INT TERM

require_supported_docker_engine

# front rollout은 backend 시퀀스를 재실행하지 않고 여기서 끝난다. 같은 deploy lock을 잡으므로
# backend 배포와 동시에 진행되지 않는다.
if [[ "${DEPLOY_TARGET}" == "front" ]]; then
  # backend 경로는 deploy.yml이 이 값을 항상 넘기지만 front 경로는 HOME_SERVER_ENV를 넘기지
  # 않는다. front 경로에서만 파일을 읽는 이유는 backend 경로에서 값이 뒤늦게 바뀌면 위에서
  # 이미 계산된 auto-memory-tuner 예산 상한과 어긋나기 때문이다(그 경로는 손대지 않는다).
  resolve_runtime_split_from_env_file
  if ! run_front_blue_green_deploy; then
    exit 1
  fi
  exit 0
fi

validate_storage_env
require_back_image
validate_required_runtime_env
configure_runtime_split_env
apply_auto_memory_tuner
# compose를 처음 부르기 전에 끝내야 한다. front 프로필이 켜진 채 FRONT_*_IMAGE가 비어 있으면
# 아래 detect_active_backend의 `compose ps`부터 전부 실패한다.
prepare_front_runtime_images
persist_front_caddy_upstream

web_domain="$(env_value "WEB_DOMAIN")"
if [[ -z "${web_domain}" ]]; then
  echo "missing WEB_DOMAIN in ${ENV_FILE}" >&2
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
"${SCRIPT_DIR}/minio_service_identity.sh" prepare "${ENV_FILE}" "${DATA_NETWORK_NAME}"
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
# 프로필만 켜고 boot 목록에 없으면 `compose up`이 front 컨테이너를 아예 만들지 않는다.
# 프로필이 꺼져 있을 때 이름을 넘기면 compose가 "no such service"로 실패하므로 조건부로 넣는다.
# 두 색을 모두 띄운다. 비활성 색은 트래픽을 받지 않지만 warm rollback 대상이다 — cutover(#1539)가
# 실패하면 이전 색으로 즉시 되돌려야 하는데, 그때 cold boot를 기다리면 공개 사이트가 그만큼 더
# 오래 깨져 있다. back_*와 달리 front는 색당 768m 상한이라 상시 두 색을 유지할 여유가 있다.
front_services_to_boot=()
if compose_profile_enabled "front"; then
  front_services_to_boot=(front_blue front_green)
  compose_up_with_retry "${front_services_to_boot[@]}"
fi
ensure_monitoring_bind_mount_permissions
# force-recreate --no-deps so json-file max-size/max-file logging applies without
# recreating backend/DB dependencies (logging opts bind at container create).
monitoring_services_to_boot=(
  alertmanager loki promtail prometheus grafana
  public_edge_probe docker_runtime_probe postgres_exporter
)
compose_up_force_recreate_no_deps_with_retry "${monitoring_services_to_boot[@]}"
# docker_socket_proxy only boots implicitly through autoheal's depends_on, and a
# proxy crash loop leaves autoheal "running" but unable to heal anything, so it is
# gated explicitly. `|| true` keeps the diagnostic-only gate from aborting deploy.
warn_crashlooping_services \
  "${services_to_boot[@]}" \
  "${edge_services_to_boot[@]}" \
  ${front_services_to_boot[@]+"${front_services_to_boot[@]}"} \
  "${monitoring_services_to_boot[@]}" \
  docker_socket_proxy || true
reset_grafana_admin_password
ensure_caddy_mount_sync
if [[ "${active_backend_was_running}" == "true" ]]; then
  check_cloudflared_runtime "${web_domain}"
else
  echo "skip cloudflared runtime check before candidate health: active backend is not running (${active_backend})"
fi
warn_grafana_embed_origin_route
warn_grafana_embed_public_route
validate_db_runtime_role_env
provision_db_runtime_role
validate_postgres_exporter_env
provision_postgres_exporter_role
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

if ! verify_caddy_route "${next_backend}" "${web_domain}"; then
  rollback_to_backend "${active_backend}" "${web_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

post_code="$(probe_caddy_http_code "${web_domain}")"
if ! is_healthy_http_code "${post_code}"; then
  echo "post-switch verify failed (status=${post_code:-none})" >&2
  rollback_to_backend "${active_backend}" "${web_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

echo "post-switch phase: notification sse verify"
if ! check_notification_sse_route "${web_domain}"; then
  echo "post-switch notification sse verify failed" >&2
  rollback_to_backend "${active_backend}" "${web_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

echo "post-switch phase: blue/green burn-in"
if ! run_blue_green_burn_in "${next_backend}" "${active_backend}" "${web_domain}"; then
  exit 1
fi

echo "${next_backend}" > "${STATE_FILE}"
write_backend_release_state "${next_backend}" "${active_backend}"
drain_and_stop_backend_if_running "${active_backend}"

echo "post-switch phase: install steady-state guard"
ensure_steady_state_guard || true

echo "post-switch phase: cloudflared runtime verify"
if ! check_cloudflared_runtime "${web_domain}"; then
  echo "post-switch cloudflared runtime verify failed" >&2
  rollback_to_backend "${active_backend}" "${web_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

echo "post-switch phase: grafana embed route verify"
warn_grafana_embed_origin_route
warn_grafana_embed_public_route

echo "post-switch phase: public read prewarm"
prewarm_public_read_cache "${web_domain}"

echo "post-switch verify ok (status=${post_code}); burn-in complete; inactive backend stopped"
compose ps
