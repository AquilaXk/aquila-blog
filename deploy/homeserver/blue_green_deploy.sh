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

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

detect_active_backend() {
  local active_from_caddy
  active_from_caddy="$(grep -Eo 'back_(blue|green):8080' "${CADDY_FILE}" | head -n 1 | cut -d: -f1 || true)"

  if [[ "${active_from_caddy}" == "back_blue" || "${active_from_caddy}" == "back_green" ]]; then
    echo "${active_from_caddy}"
    return
  fi

  if [[ -f "${STATE_FILE}" ]]; then
    local active_from_state
    active_from_state="$(cat "${STATE_FILE}" || true)"
    if [[ "${active_from_state}" == "back_blue" || "${active_from_state}" == "back_green" ]]; then
      echo "${active_from_state}"
      return
    fi
  fi

  echo "back_blue"
}

switch_caddy_upstream() {
  local next_backend="$1"
  local tmp_file
  tmp_file="$(mktemp)"

  sed -E "s/back_(blue|green):8080/${next_backend}:8080/" "${CADDY_FILE}" > "${tmp_file}"
  mv "${tmp_file}" "${CADDY_FILE}"

  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
}

check_backend_health() {
  local backend="$1"
  local attempt=1

  while [[ "${attempt}" -le "${HEALTHCHECK_RETRIES}" ]]; do
    local code
    code="$(
      docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
        -s -o /dev/null -w "%{http_code}" "http://${backend}:8080${HEALTHCHECK_PATH}" || true
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
echo "${next_backend}" > "${STATE_FILE}"

if [[ "${active_backend}" != "${next_backend}" ]]; then
  compose stop "${active_backend}" || true
fi

compose ps
