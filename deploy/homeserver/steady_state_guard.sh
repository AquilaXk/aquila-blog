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

host_caddy_sha256() {
  sha256sum "${CADDY_HOST_FILE}" 2>/dev/null | awk '{print $1}' | tr -d '\r'
}

mounted_caddy_sha256() {
  compose exec -T caddy sh -lc "sha256sum ${CADDY_CONTAINER_FILE} | awk '{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1
}

list_running_backends() {
  compose ps --status running --services 2>/dev/null | grep -E '^back_(blue|green)$' || true
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
  if ensure_caddy_mount_sync; then ok=$((ok + 1)); fi
  if check_api_readiness; then ok=$((ok + 1)); fi

  if [[ "${ok}" -ne 3 ]]; then
    compose logs --no-color --tail=80 caddy >&2 || true
    exit 1
  fi
}

main "$@"
