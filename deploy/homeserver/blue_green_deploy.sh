#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_FILE="${SCRIPT_DIR}/Caddyfile"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
NETWORK_NAME="blog_home_default"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-120}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
CADDY_SWITCH_VERIFY_RETRIES="${CADDY_SWITCH_VERIFY_RETRIES:-15}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_MAX_TIME_SECONDS="${HEALTHCHECK_MAX_TIME_SECONDS:-5}"
HEALTHCHECK_LOG_EVERY_N_TRIES="${HEALTHCHECK_LOG_EVERY_N_TRIES:-5}"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '$1 == key {print substr($0, index($0, "=") + 1); exit}' "${ENV_FILE}"
}

backend_host() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_blue"
    return
  fi
  echo "back_green"
}

detect_active_backend() {
  local running_services
  running_services="$(compose ps --status running --services 2>/dev/null || true)"

  local is_blue_running="false"
  local is_green_running="false"

  if echo "${running_services}" | grep -qx "back_blue"; then
    is_blue_running="true"
  fi

  if echo "${running_services}" | grep -qx "back_green"; then
    is_green_running="true"
  fi

  if [[ -f "${STATE_FILE}" ]]; then
    local active_from_state
    active_from_state="$(cat "${STATE_FILE}" || true)"

    if [[ "${active_from_state}" == "back_blue" && "${is_blue_running}" == "true" ]]; then
      echo "back_blue"
      return
    fi

    if [[ "${active_from_state}" == "back_green" && "${is_green_running}" == "true" ]]; then
      echo "back_green"
      return
    fi
  fi

  if [[ "${is_blue_running}" == "true" && "${is_green_running}" != "true" ]]; then
    echo "back_blue"
    return
  fi

  if [[ "${is_green_running}" == "true" && "${is_blue_running}" != "true" ]]; then
    echo "back_green"
    return
  fi

  echo "back_blue"
}

probe_caddy_http_code() {
  local api_domain="$1"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
    --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
    -s -o /dev/null -w "%{http_code}" "http://caddy:80${HEALTHCHECK_PATH}" \
    -H "Host: ${api_domain}" || true
}

resolve_in_caddy() {
  local host="$1"
  compose exec -T caddy getent hosts "${host}" >/dev/null 2>&1
}

verify_caddy_route_ready() {
  local next_backend="$1"
  local next_backend_host
  next_backend_host="$(backend_host "${next_backend}")"
  local api_domain
  api_domain="$(env_value "API_DOMAIN")"

  if [[ -z "${api_domain}" ]]; then
    echo "missing API_DOMAIN in ${ENV_FILE}" >&2
    return 1
  fi

  local attempt=1
  while [[ "${attempt}" -le "${CADDY_SWITCH_VERIFY_RETRIES}" ]]; do
    # Ensure both blue/green names and fixed active alias are resolvable inside caddy.
    if ! resolve_in_caddy "back_blue" || ! resolve_in_caddy "back_green" || ! resolve_in_caddy "back_active"; then
      echo "caddy DNS resolve pending for back_blue/back_green/back_active (try ${attempt}/${CADDY_SWITCH_VERIFY_RETRIES})"
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    if ! resolve_in_caddy "${next_backend_host}"; then
      echo "caddy DNS resolve pending for ${next_backend_host} (try ${attempt}/${CADDY_SWITCH_VERIFY_RETRIES})"
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    local code
    code="$(probe_caddy_http_code "${api_domain}")"

    if [[ "${code}" =~ ^[1-4][0-9][0-9]$ ]]; then
      echo "caddy route verify ok (next=${next_backend}, status=${code})"
      return 0
    fi

    echo "caddy route verify pending (next=${next_backend}, try ${attempt}/${CADDY_SWITCH_VERIFY_RETRIES}, status=${code:-none})"
    sleep 1
    attempt=$((attempt + 1))
  done

  echo "caddy route verify failed: next=${next_backend_host}" >&2
  compose logs --no-color --tail=120 caddy >&2 || true
  return 1
}

check_backend_health() {
  local backend="$1"
  local backend_host_name
  backend_host_name="$(backend_host "${backend}")"
  local attempt=1

  while [[ "${attempt}" -le "${HEALTHCHECK_RETRIES}" ]]; do
    local code
    code="$(
      docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
        --connect-timeout "${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS}" \
        --max-time "${HEALTHCHECK_MAX_TIME_SECONDS}" \
        -s -o /dev/null -w "%{http_code}" "http://${backend_host_name}:8080${HEALTHCHECK_PATH}" || true
    )"

    if [[ "${code}" =~ ^[1-4][0-9][0-9]$ ]]; then
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
  echo "----- ${backend} recent logs -----" >&2
  compose logs --no-color --tail=200 "${backend}" >&2 || true
  echo "----- ${backend} container status -----" >&2
  compose ps "${backend}" >&2 || true
  return 1
}

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing env file: ${ENV_FILE}" >&2
  exit 1
fi

if [[ ! -f "${CADDY_FILE}" ]]; then
  echo "missing caddy file: ${CADDY_FILE}" >&2
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
echo "BACK_IMAGE: ${BACK_IMAGE:-unset}"

compose up -d db_1 redis_1 caddy cloudflared
compose pull "${next_backend}"
compose up -d "${next_backend}"

check_backend_health "${next_backend}"
if ! verify_caddy_route_ready "${next_backend}"; then
  echo "route verify failed before cutover; keeping ${active_backend} running and stopping ${next_backend}" >&2
  compose stop "${next_backend}" || true
  exit 1
fi

if [[ "${active_backend}" != "${next_backend}" ]]; then
  compose stop "${active_backend}" || true
fi

api_domain="$(env_value "API_DOMAIN")"
if [[ -n "${api_domain}" ]]; then
  post_stop_code="$(probe_caddy_http_code "${api_domain}")"
  if ! [[ "${post_stop_code}" =~ ^[1-4][0-9][0-9]$ ]]; then
    echo "post-stop verify failed (status=${post_stop_code:-none}), attempting rollback to ${active_backend}" >&2
    compose up -d "${active_backend}" || true

    rollback_host="$(backend_host "${active_backend}")"
    if ! resolve_in_caddy "${rollback_host}"; then
      echo "rollback skipped: ${rollback_host} is not resolvable from caddy" >&2
      compose logs --no-color --tail=120 caddy >&2 || true
      exit 1
    fi

    if ! check_backend_health "${active_backend}"; then
      echo "rollback skipped: ${active_backend} healthcheck failed" >&2
      compose logs --no-color --tail=120 "${active_backend}" >&2 || true
      exit 1
    fi

    rollback_code="$(probe_caddy_http_code "${api_domain}")"
    if ! [[ "${rollback_code}" =~ ^[1-4][0-9][0-9]$ ]]; then
      echo "rollback failed: caddy status=${rollback_code:-none}" >&2
      compose logs --no-color --tail=120 caddy >&2 || true
      exit 1
    fi

    echo "${active_backend}" > "${STATE_FILE}"
    echo "rollback recovered with ${active_backend} (status=${rollback_code})"
    compose logs --no-color --tail=120 caddy >&2 || true
    exit 1
  fi
  echo "post-stop verify ok (status=${post_stop_code})"
fi

echo "${next_backend}" > "${STATE_FILE}"

compose ps
