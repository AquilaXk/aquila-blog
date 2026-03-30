#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_HOST_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
API_READINESS_URL="https://api.aquilaxk.site/actuator/health/readiness"
WWW_URL="https://www.aquilaxk.site/"
API_ROOT_URL="https://api.aquilaxk.site/"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

env_value() {
  local key="$1"
  awk -F= -v key="${key}" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/\r/, "", value)
      print value
    }
  ' "${ENV_FILE}" | tail -n 1
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

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  echo "${value}"
}

container_image_for_service_any_state() {
  local service="$1"
  local container_id
  container_id="$(
    docker ps -aq \
      --filter "label=com.docker.compose.project=blog_home" \
      --filter "label=com.docker.compose.service=${service}" 2>/dev/null | head -n 1 || true
  )"
  if [[ -z "${container_id}" ]]; then
    return 0
  fi

  docker inspect --format '{{.Config.Image}}' "${container_id}" 2>/dev/null | tr -d '\r' | head -n 1 || true
}

repair_back_image_if_missing() {
  local value repaired_value state_backend
  value="$(trim_quotes "$(env_value "BACK_IMAGE")")"
  if [[ -n "${value}" ]]; then
    echo "recover BACK_IMAGE preserved: ${value}"
    return 0
  fi

  state_backend="$(cat "${SCRIPT_DIR}/.active_backend" 2>/dev/null || true)"
  if [[ "${state_backend}" == "back_blue" || "${state_backend}" == "back_green" ]]; then
    repaired_value="$(container_image_for_service_any_state "${state_backend}" || true)"
    if [[ -n "${repaired_value}" ]]; then
      echo "recover BACK_IMAGE repair source=state_backend_container backend=${state_backend} image=${repaired_value}"
    fi
  fi

  if [[ -z "${repaired_value}" ]]; then
    for backend in back_blue back_green; do
      repaired_value="$(container_image_for_service_any_state "${backend}" || true)"
      if [[ -n "${repaired_value}" ]]; then
        echo "recover BACK_IMAGE repair source=${backend}_container image=${repaired_value}"
        break
      fi
    done
  fi

  if [[ -z "${repaired_value}" ]]; then
    echo "BACK_IMAGE is empty in ${ENV_FILE} and no repair source is available." >&2
    exit 1
  fi

  upsert_env_key "BACK_IMAGE" "${repaired_value}"
  echo "recover repaired missing BACK_IMAGE=${repaired_value}"
}

require_back_image() {
  local value
  repair_back_image_if_missing
  value="$(trim_quotes "$(env_value "BACK_IMAGE")")"

  if [[ -z "${value}" ]]; then
    echo "BACK_IMAGE is empty in ${ENV_FILE}. refusing recover to avoid latest rollback." >&2
    exit 1
  fi
  if [[ "${value}" == *":latest" ]]; then
    echo "BACK_IMAGE latest is forbidden in ${ENV_FILE}: ${value}" >&2
    exit 1
  fi
  if [[ "${value}" != *@sha256:* && "${value}" != *:* ]]; then
    echo "BACK_IMAGE must include tag or digest in ${ENV_FILE}: ${value}" >&2
    exit 1
  fi

  BACK_IMAGE="${value}"
  export BACK_IMAGE
}

section() {
  printf "\n== [%s] %s ==\n" "$1" "$2"
}

health_of() {
  local service="$1"
  local container_id
  container_id="$(compose ps -q "${service}" 2>/dev/null | head -n 1 || true)"
  if [[ -z "${container_id}" ]]; then
    echo "missing"
    return
  fi

  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}" 2>/dev/null || echo "unknown"
}

active_upstream() {
  local upstream
  upstream="$(awk '$1 == "reverse_proxy" && $2 ~ /^back[_-](blue|green):8080$/ {split($2, a, ":"); print a[1]; exit}' "${CADDY_HOST_FILE}" 2>/dev/null || true)"
  echo "${upstream//-/_}"
}

switch_upstream() {
  local target="$1"
  local current
  current="$(active_upstream)"

  if [[ -z "${current}" || "${current}" == "${target}" ]]; then
    echo "[switch] no change (current=${current:-none}, target=${target})"
    return
  fi

  echo "[switch] ${current} -> ${target}"
  local current_pattern
  current_pattern="${current//_/[_-]}"
  sed -i -E "s/${current_pattern}:8080/${target}:8080/g" "${CADDY_HOST_FILE}"
  compose up -d --force-recreate caddy
}

stop_inactive_backend() {
  local active="$1"
  local inactive
  if [[ "${active}" == "back_blue" ]]; then
    inactive="back_green"
  elif [[ "${active}" == "back_green" ]]; then
    inactive="back_blue"
  else
    return
  fi

  echo "[steady-state] stop inactive backend: ${inactive}"
  compose stop "${inactive}" >/dev/null 2>&1 || true
}

main() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "missing env file: ${ENV_FILE}" >&2
    exit 1
  fi

  require_back_image

  section "0" "start core services"
  compose up -d back_blue back_green caddy cloudflared uptime_kuma prometheus grafana

  section "1" "wait for backend health"
  local blue green
  for i in {1..30}; do
    blue="$(health_of back_blue)"
    green="$(health_of back_green)"
    echo "try=${i} blue=${blue} green=${green}"
    if [[ "${blue}" == "healthy" || "${green}" == "healthy" ]]; then
      break
    fi
    sleep 2
  done

  section "2" "validate/switch caddy upstream"
  local active
  active="$(active_upstream)"
  blue="$(health_of back_blue)"
  green="$(health_of back_green)"
  echo "active=${active:-none} blue=${blue} green=${green}"

  if [[ "${active}" == "back_blue" && "${blue}" != "healthy" && "${green}" == "healthy" ]]; then
    switch_upstream "back_green"
  elif [[ "${active}" == "back_green" && "${green}" != "healthy" && "${blue}" == "healthy" ]]; then
    switch_upstream "back_blue"
  else
    echo "[switch] no failover required"
  fi

  section "3" "tailscale recover"
  sudo systemctl restart tailscaled || true
  sleep 2
  local tailscale_out
  tailscale_out="$(tailscale status 2>&1 || true)"
  if grep -q "unexpected state: NoState" <<< "${tailscale_out}"; then
    echo "[tailscale] NoState detected -> reattach"
    sudo tailscale up --ssh --reset || true
  fi
  tailscale status || true

  section "4" "external probes"
  local readiness_code
  for i in {1..15}; do
    readiness_code="$(curl -sS -m 8 -o /dev/null -w "%{http_code}" "${API_READINESS_URL}" || true)"
    echo "readiness try=${i} code=${readiness_code}"
    if [[ "${readiness_code}" == "200" ]]; then
      break
    fi
    sleep 2
  done

  section "5" "final status"
  active="$(active_upstream)"
  local active_health
  if [[ "${active}" == "back_blue" ]]; then
    active_health="$(health_of back_blue)"
  elif [[ "${active}" == "back_green" ]]; then
    active_health="$(health_of back_green)"
  else
    active_health="unknown"
  fi
  if [[ "${active_health}" == "healthy" ]]; then
    stop_inactive_backend "${active}"
  fi

  curl -sS -m 10 -o /dev/null -w "www %{http_code} %{time_total}\n" "${WWW_URL}" || true
  curl -sS -m 10 -o /dev/null -w "api_root %{http_code} %{time_total}\n" "${API_ROOT_URL}" || true
  curl -sS -m 10 -i "${API_READINESS_URL}" | sed -n "1,25p" || true
  compose ps
}

main "$@"
