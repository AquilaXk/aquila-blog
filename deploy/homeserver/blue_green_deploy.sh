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
    echo "back-blue"
    return
  fi
  echo "back-green"
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

  local active_from_caddy
  active_from_caddy="$(grep -Eo 'back[-_](blue|green):8080' "${CADDY_FILE}" | head -n 1 | cut -d: -f1 || true)"
  active_from_caddy="${active_from_caddy//-/_}"

  if [[ "${active_from_caddy}" == "back_blue" && "${is_blue_running}" == "true" ]]; then
    echo "back_blue"
    return
  fi

  if [[ "${active_from_caddy}" == "back_green" && "${is_green_running}" == "true" ]]; then
    echo "back_green"
    return
  fi

  if [[ "${is_blue_running}" == "true" && "${is_green_running}" != "true" ]]; then
    echo "back_blue"
    return
  fi

  if [[ "${is_green_running}" == "true" && "${is_blue_running}" != "true" ]]; then
    echo "back_green"
    return
  fi

  if [[ "${active_from_caddy}" == "back_blue" || "${active_from_caddy}" == "back_green" ]]; then
    echo "${active_from_caddy}"
    return
  fi

  echo "back_blue"
}

switch_caddy_upstream() {
  local next_backend="$1"
  local next_backend_host
  next_backend_host="$(backend_host "${next_backend}")"
  local tmp_file
  tmp_file="$(mktemp)"

  sed -E "s/back[-_](blue|green):8080/${next_backend_host}:8080/" "${CADDY_FILE}" > "${tmp_file}"
  mv "${tmp_file}" "${CADDY_FILE}"

  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
}

verify_caddy_upstream() {
  local expected_backend="$1"
  local expected_backend_host
  expected_backend_host="$(backend_host "${expected_backend}")"
  local api_domain
  api_domain="$(env_value "API_DOMAIN")"

  if [[ -z "${api_domain}" ]]; then
    echo "missing API_DOMAIN in ${ENV_FILE}" >&2
    return 1
  fi

  local attempt=1
  while [[ "${attempt}" -le "${CADDY_SWITCH_VERIFY_RETRIES}" ]]; do
    local code
    code="$(
      docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
        -s -o /dev/null -w "%{http_code}" "http://caddy:80${HEALTHCHECK_PATH}" \
        -H "Host: ${api_domain}" || true
    )"

    if [[ "${code}" =~ ^[1-4][0-9][0-9]$ ]]; then
      echo "caddy switch verify ok: ${expected_backend} (status=${code})"
      return 0
    fi

    echo "caddy switch verify pending: ${expected_backend} (try ${attempt}/${CADDY_SWITCH_VERIFY_RETRIES}, status=${code:-none})"
    sleep 1
    attempt=$((attempt + 1))
  done

  echo "caddy switch verify failed: expected ${expected_backend_host}" >&2
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
        -s -o /dev/null -w "%{http_code}" "http://${backend_host_name}:8080${HEALTHCHECK_PATH}" || true
    )"

    if [[ "${code}" =~ ^[1-4][0-9][0-9]$ ]]; then
      echo "healthcheck ok: ${backend} (status=${code})"
      return 0
    fi

    echo "healthcheck pending: ${backend} (try ${attempt}/${HEALTHCHECK_RETRIES}, status=${code:-none})"
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

compose up -d db_1 redis_1 caddy
compose up -d --build "${next_backend}"

check_backend_health "${next_backend}"
switch_caddy_upstream "${next_backend}"

if ! verify_caddy_upstream "${next_backend}"; then
  echo "rolling back caddy upstream to ${active_backend}" >&2
  switch_caddy_upstream "${active_backend}" || true
  exit 1
fi

echo "${next_backend}" > "${STATE_FILE}"

if [[ "${active_backend}" != "${next_backend}" ]]; then
  compose stop "${active_backend}" || true
fi

compose ps
