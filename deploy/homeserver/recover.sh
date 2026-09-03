#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_HOST_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
RELEASE_STATE_FILE="${SCRIPT_DIR}/.backend-release-state.env"

compose() {
  bash "${SCRIPT_DIR}/materialize_service_env.sh" "${ENV_FILE}"
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

env_value() {
  local key="$1"
  # 선행 공백과 `export ` 접두를 인식하지 못하면, 계약이 받아들이는 표기를 이 스크립트만
  # 못 읽는다. deploy.yml의 read_prod_env_value와 같은 범위를 유지한다.
  awk -v key="${key}" '
    match($0, "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*=") {
      value = substr($0, RSTART + RLENGTH)
      gsub(/\r/, "", value)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      gsub(/^["'\'']|["'\'']$/, "", value)
      print value
    }
  ' "${ENV_FILE}" | tail -n 1
}

# 복구 대상 URL을 리터럴로 박아 두면, 도메인 전환 창에 장애 대응으로 이 스크립트를 돌렸을 때
# 아직 존재하지 않는 호스트를 찌른다. curl에 `|| true`가 붙어 있어 그 실패는 `web 000`으로만
# 보이고 조용히 지나간다. 배포가 핀한 .env.prod가 그 시점의 실제 운영 호스트다.
#
# 값이 없다고 여기서 죽으면 안 된다. .env.prod가 부분 복원된 상태가 바로 이 스크립트가 가장
# 필요한 순간인데, 보고용 URL 하나 때문에 컨테이너 복구를 한 줄도 못 하게 된다.
PROD_FRONT_URL="$(env_value "CUSTOM_PROD_FRONTURL")"
PROD_BACK_URL="$(env_value "CUSTOM_PROD_BACKURL")"
WEB_URL=""
API_ROOT_URL=""
API_READINESS_URL=""
if [[ -n "${PROD_FRONT_URL}" ]]; then
  WEB_URL="${PROD_FRONT_URL%/}/"
else
  echo "recover: CUSTOM_PROD_FRONTURL missing from ${ENV_FILE}; skipping the public web probe" >&2
fi
if [[ -n "${PROD_BACK_URL}" ]]; then
  API_ROOT_URL="${PROD_BACK_URL%/}/"
  API_READINESS_URL="${PROD_BACK_URL%/}/actuator/health/readiness"
else
  echo "recover: CUSTOM_PROD_BACKURL missing from ${ENV_FILE}; skipping the public API probes" >&2
fi

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

release_state_image_key() {
  local service="$1"
  case "${service}" in
    back_blue) echo "back_blue_image" ;;
    back_green) echo "back_green_image" ;;
    back_read) echo "back_read_image" ;;
    back_admin) echo "back_admin_image" ;;
    back_worker) echo "back_worker_image" ;;
    *)
      echo "unknown backend release-state service: ${service}" >&2
      return 1
      ;;
  esac
}

release_state_image_for_service() {
  local service="$1"
  local key
  key="$(release_state_image_key "${service}")"
  awk -F= -v key="${key}" '
    $1 == key { value = substr($0, index($0, "=") + 1); count++ }
    END { if (count != 1 || value == "") exit 1; print value }
  ' "${RELEASE_STATE_FILE}"
}

require_digest_image_value() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "${key} is empty in ${ENV_FILE}. refusing recover to avoid latest rollback." >&2
    exit 1
  fi
  if [[ "${value}" == *":latest" || "${value}" == *":latest@"* ]]; then
    echo "${key} latest is forbidden in ${ENV_FILE}: ${value}" >&2
    exit 1
  fi
  if [[ ! "${value}" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]; then
    echo "${key} must include sha256 digest in ${ENV_FILE}: ${value}" >&2
    exit 1
  fi
}

repair_runtime_back_image_if_missing() {
  local service="$1"
  local key value repaired_value
  key="$(backend_image_key "${service}")"
  value="$(trim_quotes "$(env_value "${key}")")"
  if [[ -n "${value}" ]]; then
    echo "recover ${key} preserved: ${value}"
    require_digest_image_value "${key}" "${value}"
    return 0
  fi

  if [[ -f "${RELEASE_STATE_FILE}" ]]; then
    if ! repaired_value="$(release_state_image_for_service "${service}")"; then
      echo "recover ${key} release-state evidence is missing or malformed: ${RELEASE_STATE_FILE}" >&2
      exit 1
    fi
    echo "recover ${key} repair source=release_state image=${repaired_value}"
  else
    repaired_value="$(container_image_for_service_any_state "${service}" || true)"
    if [[ -n "${repaired_value}" ]]; then
      echo "recover ${key} repair source=${service}_container image=${repaired_value}"
    fi
  fi

  require_digest_image_value "${key}" "${repaired_value}"
  upsert_env_key "${key}" "${repaired_value}"
  echo "recover repaired missing ${key}=${repaired_value}"
}

require_runtime_back_images() {
  repair_runtime_back_image_if_missing "back_blue"
  repair_runtime_back_image_if_missing "back_green"
  repair_runtime_back_image_if_missing "back_read"
  repair_runtime_back_image_if_missing "back_admin"
  repair_runtime_back_image_if_missing "back_worker"
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

# runtime-split serves the edge from back_read/back_admin through Caddyfile env
# placeholders. A literal blue/green awk returns empty there, which made the failover below
# a silent no-op (#1418), so the upstream is resolved through the shared probe.
active_upstream() {
  ENV_FILE="${ENV_FILE}" COMPOSE_FILE="${COMPOSE_FILE}" CADDY_FILE="${CADDY_HOST_FILE}" \
    bash "${SCRIPT_DIR}/caddy_upstream_probe.sh" host 2>/dev/null || true
}

switch_upstream() {
  local target="$1"
  local current
  current="$(active_upstream)"

  if [[ -z "${current}" || "${current}" == "${target}" ]]; then
    echo "[switch] no change (current=${current:-none}, target=${target})"
    return
  fi

  # Colour failover only applies when the edge is pinned to a blue/green host. Under
  # runtime-split the edge points at back_read/back_admin, so rewriting a colour here would
  # match nothing and report a switch that never happened.
  if [[ "${current}" != "back_blue" && "${current}" != "back_green" ]]; then
    echo "[switch] skipped: edge upstream is ${current}, not a blue/green colour (runtime-split serves back_read/back_admin; recover those services instead)"
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

  require_runtime_back_images

  section "0" "start core services"
  compose up -d back_blue back_green caddy cloudflared uptime_kuma \
    loki promtail prometheus grafana \
    public_edge_probe docker_runtime_probe postgres_exporter

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

  if [[ -n "${WEB_URL}" ]]; then
    curl -sS -m 10 -o /dev/null -w "web %{http_code} %{time_total}\n" "${WEB_URL}" || true
  fi
  if [[ -n "${API_ROOT_URL}" ]]; then
    curl -sS -m 10 -o /dev/null -w "api_root %{http_code} %{time_total}\n" "${API_ROOT_URL}" || true
    curl -sS -m 10 -i "${API_READINESS_URL}" | sed -n "1,25p" || true
  fi
  compose ps
}

main "$@"
