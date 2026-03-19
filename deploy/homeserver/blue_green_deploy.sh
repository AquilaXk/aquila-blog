#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_FILE="${SCRIPT_DIR}/Caddyfile"
STATE_FILE="${SCRIPT_DIR}/.active_backend"
NETWORK_NAME="blog_home_default"
HEALTHCHECK_PATH="${HEALTHCHECK_PATH:-/actuator/health/readiness}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-120}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
HEALTHCHECK_CONNECT_TIMEOUT_SECONDS="${HEALTHCHECK_CONNECT_TIMEOUT_SECONDS:-2}"
HEALTHCHECK_MAX_TIME_SECONDS="${HEALTHCHECK_MAX_TIME_SECONDS:-5}"
HEALTHCHECK_LOG_EVERY_N_TRIES="${HEALTHCHECK_LOG_EVERY_N_TRIES:-5}"

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

compose_up_with_retry() {
  local max_attempts=4
  local attempt=1
  local output=""
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    if output="$(compose up -d "$@" 2>&1)"; then
      echo "${output}"
      return 0
    fi

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
  cf_logs="$(compose logs --no-color --tail=160 cloudflared || true)"
  if ! echo "${cf_logs}" | grep -Eqi 'Registered tunnel connection|Connection .* registered'; then
    echo "cloudflared tunnel registration log not found" >&2
    echo "${cf_logs}" >&2
    return 1
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

require_back_image() {
  if [[ -z "${BACK_IMAGE:-}" ]]; then
    echo "BACK_IMAGE is empty. refusing deploy to avoid accidental latest-image rollout." >&2
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
    echo "back-blue"
    return
  fi
  echo "back-green"
}

other_backend() {
  local backend="$1"
  if [[ "${backend}" == "back_blue" ]]; then
    echo "back_green"
    return
  fi
  echo "back_blue"
}

backend_container_id() {
  local backend="$1"
  compose ps -q "${backend}" | head -n 1
}

resolve_in_caddy() {
  local host="$1"
  compose exec -T caddy getent hosts "${host}" >/dev/null 2>&1
}

get_caddy_ip() {
  local host="$1"
  compose exec -T caddy sh -lc "getent hosts ${host} | awk 'NR==1{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1
}

get_caddy_ips() {
  local host="$1"
  compose exec -T caddy sh -lc "getent hosts ${host} | awk '{print \$1}' | sort -u" 2>/dev/null | tr -d '\r'
}

has_single_caddy_ip() {
  local host="$1"
  local ips
  ips="$(get_caddy_ips "${host}")"
  local count
  count="$(echo "${ips}" | sed '/^$/d' | wc -l | tr -d ' ')"
  [[ "${count}" == "1" ]]
}

backend_has_back_active_alias() {
  local backend="$1"
  local cid
  cid="$(backend_container_id "${backend}")"
  if [[ -z "${cid}" ]]; then
    return 1
  fi

  docker inspect \
    --format '{{range $k,$v := .NetworkSettings.Networks}}{{if eq $k "'"${NETWORK_NAME}"'"}}{{range $v.Aliases}}{{println .}}{{end}}{{end}}{{end}}' \
    "${cid}" 2>/dev/null | grep -qx "back_active"
}

ensure_caddyfile_back_active() {
  local tmp_file
  tmp_file="$(mktemp)"
  sed -E "s/back[-_](blue|green|active):8080/back_active:8080/" "${CADDY_FILE}" > "${tmp_file}"
  mv "${tmp_file}" "${CADDY_FILE}"
  reload_caddy
}

reload_caddy() {
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
}

is_healthy_http_code() {
  local code="$1"
  [[ "${code}" == "200" ]]
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
        -s -o /dev/null -w "%{http_code}" "http://${host}:8080${HEALTHCHECK_PATH}"
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
  compose logs --no-color --tail=200 "${backend}" >&2 || true
  compose ps "${backend}" >&2 || true
  return 1
}

connect_backend_network() {
  local backend="$1"
  local with_active_alias="$2"
  local max_attempts=5
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    local cid
    cid="$(backend_container_id "${backend}")"
    if [[ -z "${cid}" ]]; then
      echo "container id not found: ${backend} (try ${attempt}/${max_attempts})" >&2
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    docker network disconnect "${NETWORK_NAME}" "${cid}" >/dev/null 2>&1 || true

    local args=(network connect --alias "${backend}" --alias "${backend//_/-}")
    if [[ "${with_active_alias}" == "true" ]]; then
      args+=(--alias "back_active")
    fi
    args+=("${NETWORK_NAME}" "${cid}")

    local output
    if output="$(docker "${args[@]}" 2>&1)"; then
      return 0
    fi

    if grep -Eqi "network sandbox .* not found|No such container|is not running|already exists in network" <<< "${output}"; then
      echo "network attach retry (${backend}, try ${attempt}/${max_attempts}): ${output}" >&2
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    echo "${output}" >&2
    return 1
  done

  echo "failed to attach ${backend} to ${NETWORK_NAME} after ${max_attempts} retries" >&2
  return 1
}

switch_active_alias() {
  local target="$1"
  local other
  other="$(other_backend "${target}")"

  connect_backend_network "${target}" "true"

  if ! connect_backend_network "${other}" "false"; then
    echo "failed to refresh aliases for ${other}" >&2
    return 1
  fi

  if ! backend_has_back_active_alias "${target}"; then
    echo "back_active alias missing on target backend: ${target}" >&2
    return 1
  fi
  if backend_has_back_active_alias "${other}"; then
    echo "back_active alias still attached to non-target backend: ${other}" >&2
    return 1
  fi

  if ! resolve_in_caddy "back_active" || ! has_single_caddy_ip "back_active"; then
    echo "caddy dns resolve failed: back_active" >&2
    return 1
  fi

  local active_ip target_ip
  active_ip="$(get_caddy_ip "back_active")"
  target_ip="$(get_caddy_ip "$(backend_host "${target}")")"
  if [[ -z "${active_ip}" || -z "${target_ip}" || "${active_ip}" != "${target_ip}" ]]; then
    echo "back_active alias mismatch: active=${active_ip:-none}, target=${target_ip:-none}" >&2
    return 1
  fi

  # Force Caddy to resolve the updated back_active alias before public route verification.
  reload_caddy

  echo "back_active alias switched to ${target} (${active_ip})"
}

verify_caddy_route() {
  local expected_backend="$1"
  local api_domain="$2"
  local expected_ip
  expected_ip="$(get_caddy_ip "$(backend_host "${expected_backend}")")"

  if [[ -z "${expected_ip}" ]]; then
    echo "expected backend ip not found for ${expected_backend}" >&2
    return 1
  fi

  local attempt=1
  while [[ "${attempt}" -le 20 ]]; do
    if ! has_single_caddy_ip "back_active"; then
      local active_ips
      active_ips="$(get_caddy_ips "back_active" | tr '\n' ',' | sed 's/,$//')"
      echo "caddy alias pending: back_active resolves to multiple ips [${active_ips:-none}] (try ${attempt}/20)"
      sleep 1
      attempt=$((attempt + 1))
      continue
    fi

    local active_ip
    active_ip="$(get_caddy_ip "back_active")"
    if [[ -n "${active_ip}" && "${active_ip}" == "${expected_ip}" ]]; then
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
    else
      echo "caddy alias pending: active=${active_ip:-none}, expected=${expected_ip} (try ${attempt}/20)"
    fi

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

  switch_active_alias "${rollback_backend}"

  if ! verify_caddy_route "${rollback_backend}" "${api_domain}"; then
    echo "rollback failed: caddy route verify failed" >&2
    return 1
  fi

  echo "${rollback_backend}" > "${STATE_FILE}"
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

validate_storage_env
require_back_image
validate_required_runtime_env

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

action_backend_host="$(backend_host "${next_backend}")"

echo "starting infra + ${next_backend} (${action_backend_host})"
compose_up_with_retry db_1 redis_1 minio_1 caddy cloudflared uptime_kuma
check_cloudflared_runtime
ensure_db_runtime_guards || true
compose pull "${next_backend}"
compose_up_with_retry "${next_backend}"

ensure_caddyfile_back_active

# Verify cutover target DNS and currently running active backend DNS (if running).
check_required_backend_dns_from_caddy "${next_backend}" "${active_backend}"
check_backend_health "${next_backend}"

switch_active_alias "${next_backend}"

if ! verify_caddy_route "${next_backend}" "${api_domain}"; then
  rollback_to_backend "${active_backend}" "${api_domain}" || true
  compose stop "${next_backend}" || true
  exit 1
fi

if [[ "${active_backend}" != "${next_backend}" ]]; then
  compose stop "${active_backend}" || true
fi

post_code="$(probe_caddy_http_code "${api_domain}")"
if ! is_healthy_http_code "${post_code}"; then
  echo "post-stop verify failed (status=${post_code:-none})" >&2
  rollback_to_backend "${active_backend}" "${api_domain}" || true
  exit 1
fi

echo "${next_backend}" > "${STATE_FILE}"

check_cloudflared_runtime

echo "post-stop verify ok (status=${post_code})"
compose ps
