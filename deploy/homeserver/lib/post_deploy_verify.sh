# shellcheck shell=bash

ensure_monitoring_bind_mount_permissions() {
  find deploy/homeserver/monitoring -type d -exec chmod 0755 {} + 2>/dev/null || true
  find deploy/homeserver/monitoring -type f -exec chmod 0644 {} + 2>/dev/null || true
  find deploy/homeserver/caddy -type d -exec chmod 0755 {} + 2>/dev/null || true
  find deploy/homeserver/caddy -type f -exec chmod 0644 {} + 2>/dev/null || true
}

emit_post_deploy_diagnostics() {
  backend_container_id_any_state() {
    local backend="$1"
    docker ps -aq \
      --filter "label=com.docker.compose.project=blog_home" \
      --filter "label=com.docker.compose.service=${backend}" | head -n 1
  }

  echo "[post-deploy-diagnostic] compose ps"
  docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps || true
  echo "[post-deploy-diagnostic] compose ps -a back_blue/back_green"
  docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps -a back_blue back_green || true
  echo "[post-deploy-diagnostic] caddy logs"
  docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs --no-color --tail=120 caddy || true
  echo "[post-deploy-diagnostic] cloudflared logs"
  docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs --no-color --tail=120 cloudflared || true
  for backend in back_blue back_green; do
    echo "[post-deploy-diagnostic] backend=${backend}"
    cid="$(backend_container_id_any_state "${backend}")"
    if [ -n "${cid}" ]; then
      docker inspect --format "${backend} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restart={{.RestartCount}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}" "${cid}" || true
    else
      echo "${backend} container=none"
    fi
    docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs --no-color --tail=160 "${backend}" || true
  done
}

verify_active_backend_and_edge() {
  # Every post-deploy check below targets the public web host. Since #1596 retired the
  # host-based API vhost address, that host is the only public front door this deploy has,
  # so an absent WEB_DOMAIN means there is nothing left to verify - fail closed instead of
  # reporting a green deploy nobody checked.
  WEB_DOMAIN="$(read_prod_env_value WEB_DOMAIN)"
  if [ -z "${WEB_DOMAIN}" ]; then
    rollback_and_exit "missing_web_domain"
  fi

  ACTIVE_BACKEND="$(cat deploy/homeserver/.active_backend 2>/dev/null || true)"
  if [ "${ACTIVE_BACKEND}" != "back_blue" ] && [ "${ACTIVE_BACKEND}" != "back_green" ]; then
    rollback_and_exit "invalid_active_backend"
  fi

  if ! docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps --status running --services | grep -qx "${ACTIVE_BACKEND}"; then
    rollback_and_exit "active_backend_not_running"
  fi

  ACTIVE_BACKEND_CONTAINER_ID="$(docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps -q "${ACTIVE_BACKEND}" | head -n 1)"
  ACTIVE_BACKEND_IMAGE="$(docker inspect --format '{{.Config.Image}}' "${ACTIVE_BACKEND_CONTAINER_ID}" 2>/dev/null | tr -d '\r')"
  case "${ACTIVE_BACKEND}" in
    back_blue) ACTIVE_BACKEND_IMAGE_KEY="BACK_BLUE_IMAGE" ;;
    back_green) ACTIVE_BACKEND_IMAGE_KEY="BACK_GREEN_IMAGE" ;;
    *)
      rollback_and_exit "invalid_active_backend_image_key"
      ;;
  esac
  EXPECTED_BACK_IMAGE="$(extract_env_value "${ACTIVE_BACKEND_IMAGE_KEY}")"
  echo "post-deploy image verify: active_backend=${ACTIVE_BACKEND}, expected_image=${EXPECTED_BACK_IMAGE}, active_image=${ACTIVE_BACKEND_IMAGE:-none}"
  if [ -z "${ACTIVE_BACKEND_CONTAINER_ID}" ] || [ -z "${ACTIVE_BACKEND_IMAGE}" ] || [ "${ACTIVE_BACKEND_IMAGE}" != "${EXPECTED_BACK_IMAGE}" ]; then
    rollback_and_exit "active_backend_image_mismatch"
  fi

  if [ "${ACTIVE_BACKEND}" = "back_blue" ]; then
    INACTIVE_BACKEND="back_green"
  else
    INACTIVE_BACKEND="back_blue"
  fi

  # runtime-split routes the edge at back_read/back_admin through Caddyfile env
  # placeholders, so a literal blue/green awk reads an empty upstream on a healthy
  # split edge and rolls the deploy back for drift that does not exist (#1418).
  # Both sides of the comparison go through the shared placeholder-aware probe.
  if ! EXPECTED_UPSTREAM="$(RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED_VALUE}" bash ./deploy/homeserver/caddy_upstream_probe.sh expected "${ACTIVE_BACKEND}")"; then
    rollback_and_exit "caddy_upstream_expectation_unresolved"
  fi
  MOUNTED_UPSTREAM="$(RUNTIME_SPLIT_ENABLED="${RUNTIME_SPLIT_ENABLED_VALUE}" bash ./deploy/homeserver/caddy_upstream_probe.sh mounted || true)"
  HAS_LEGACY_BACK_ACTIVE="false"
  if docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' /etc/caddy/Caddyfile"; then
    HAS_LEGACY_BACK_ACTIVE="true"
  fi

  echo "post-deploy upstream verify: active_backend=${ACTIVE_BACKEND}, expected=${EXPECTED_UPSTREAM}, mounted=${MOUNTED_UPSTREAM:-none}, legacy_back_active=${HAS_LEGACY_BACK_ACTIVE}"
  if [ -z "${MOUNTED_UPSTREAM}" ] || [ "${MOUNTED_UPSTREAM}" != "${EXPECTED_UPSTREAM}" ] || [ "${HAS_LEGACY_BACK_ACTIVE}" = "true" ]; then
    rollback_and_exit "caddy_upstream_mismatch"
  fi

  if docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps --status running --services | grep -qx "${INACTIVE_BACKEND}"; then
    rollback_and_exit "inactive_backend_still_running"
  fi

  # Internal edge routing gate (#1591), probed through the edge network with a Host header
  # instead of public HTTPS. A Host that matches no vhost gets `200` with an EMPTY body
  # from Caddy, so a non-zero body length is required alongside 2xx status.
  for web_api_probe_path in "/actuator/health/readiness" "/post/api/v1/posts/feed?page=1&pageSize=1&sort=CREATED_AT"; do
    WEB_API_PROBE="$(docker run --rm --network blog_home_edge curlimages/curl:8.7.1 -s -o /dev/null -w "%{http_code} %{size_download}" "http://caddy:80${web_api_probe_path}" -H "Host: ${WEB_DOMAIN}" || true)"
    WEB_API_CODE="${WEB_API_PROBE%% *}"
    WEB_API_BYTES="${WEB_API_PROBE##* }"
    echo "post-deploy web-host api route: host=${WEB_DOMAIN} path=${web_api_probe_path} status=${WEB_API_CODE:-none} bytes=${WEB_API_BYTES:-none}"
    if ! echo "${WEB_API_CODE}" | grep -Eq '^2[0-9][0-9]$'; then
      rollback_and_exit "web_host_api_route_failed"
    fi
    if ! echo "${WEB_API_BYTES}" | grep -Eq '^[1-9][0-9]*$'; then
      rollback_and_exit "web_host_api_route_empty_body"
    fi
  done
}

wait_public_api_health() {
  local web_domain="$1"
  local attempts="${DEPLOY_PUBLIC_API_ATTEMPTS:-12}"
  local connect_timeout="${DEPLOY_PUBLIC_API_CONNECT_TIMEOUT_SECONDS:-5}"
  local max_time="${DEPLOY_PUBLIC_API_MAX_TIME_SECONDS:-15}"
  local sleep_seconds="${DEPLOY_PUBLIC_API_SLEEP_SECONDS:-5}"
  local restarted=0
  local code

  for attempt in $(seq 1 "${attempts}"); do
    code="$(curl -sS --connect-timeout "${connect_timeout}" -m "${max_time}" -o /dev/null -w "%{http_code}" "https://${web_domain}/actuator/health/readiness" || true)"
    echo "post-deploy public-api health attempt=${attempt}/${attempts} status=${code}"
    if [[ "${code}" =~ ^2[0-9][0-9]$ ]]; then
      return 0
    fi

    if [ "${code}" = "000" ] && [ "${restarted}" -eq 0 ] && [ "${attempt}" -ge 3 ]; then
      echo "public-api timeout detected; restarting cloudflared once"
      docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml restart cloudflared || true
      restarted=1
      sleep 8
    fi

    sleep "${sleep_seconds}"
  done

  echo "post-deploy public-api healthcheck failed for https://${web_domain}/actuator/health/readiness" >&2
  docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs --no-color --tail=120 cloudflared >&2 || true
  return 1
}

header_value_from_file() {
  local headers_file="$1"
  local header_name="$2"
  awk -v header_name="${header_name}" '
    BEGIN { target = tolower(header_name) }
    {
      line = $0
      sub(/\r$/, "", line)
      separator = index(line, ":")
      if (separator == 0) {
        next
      }
      name = tolower(substr(line, 1, separator - 1))
      if (name == target) {
        value = substr(line, separator + 1)
        sub(/^[[:space:]]+/, "", value)
        print value
        exit
      }
    }
  ' "${headers_file}"
}

assert_header_contains() {
  local label="$1"
  local headers_file="$2"
  local header_name="$3"
  local expected_fragment="$4"
  local value
  value="$(header_value_from_file "${headers_file}" "${header_name}")"
  if [ -z "${value}" ] || [[ "${value,,}" != *"${expected_fragment,,}"* ]]; then
    echo "[security-header-smoke] FAIL ${label}: missing ${header_name} containing '${expected_fragment}'" >&2
    return 1
  fi
}

assert_live_security_headers() {
  local label="$1"
  local url="$2"
  local status_pattern="$3"
  local cache_policy="${4:-default}"
  local headers_file
  local code=""
  local smoke_attempt
  headers_file="$(mktemp)"

  for smoke_attempt in 1 2; do
    : > "${headers_file}"
    code="$(
      curl -sS \
        --connect-timeout "${DEPLOY_SECURITY_HEADER_CONNECT_TIMEOUT_SECONDS:-10}" \
        -m "${DEPLOY_SECURITY_HEADER_MAX_TIME_SECONDS:-20}" \
        -D "${headers_file}" \
        -o /dev/null \
        -w "%{http_code}" \
        "${url}" || true
    )"
    if [ "${code}" != "000" ] || [ "${smoke_attempt}" -eq 2 ]; then
      break
    fi
    sleep 1
  done
  echo "[security-header-smoke] ${label} status=${code} url=${url}"
  if ! [[ "${code}" =~ ${status_pattern} ]]; then
    echo "[security-header-smoke] FAIL ${label}: unexpected status=${code} url=${url}" >&2
    rm -f "${headers_file}"
    return 1
  fi

  assert_header_contains "${label}" "${headers_file}" "strict-transport-security" "max-age=31536000" || {
    rm -f "${headers_file}"
    return 1
  }
  assert_header_contains "${label}" "${headers_file}" "x-content-type-options" "nosniff" || {
    rm -f "${headers_file}"
    return 1
  }
  assert_header_contains "${label}" "${headers_file}" "x-frame-options" "deny" || {
    rm -f "${headers_file}"
    return 1
  }
  assert_header_contains "${label}" "${headers_file}" "referrer-policy" "strict-origin-when-cross-origin" || {
    rm -f "${headers_file}"
    return 1
  }
  assert_header_contains "${label}" "${headers_file}" "permissions-policy" "camera=()" || {
    rm -f "${headers_file}"
    return 1
  }
  if [ "${cache_policy}" = "no-store" ]; then
    assert_header_contains "${label}" "${headers_file}" "cache-control" "no-store" || {
      rm -f "${headers_file}"
      return 1
    }
  fi

  rm -f "${headers_file}"
}

run_canary_ratio_check() {
  local label="$1"
  local url="$2"
  local attempts="${DEPLOY_CANARY_ATTEMPTS:-10}"
  local min_success_percent="${DEPLOY_CANARY_MIN_SUCCESS_PERCENT:-90}"
  local connect_timeout="${DEPLOY_CANARY_CONNECT_TIMEOUT_SECONDS:-10}"
  local max_time="${DEPLOY_CANARY_MAX_TIME_SECONDS:-20}"
  local retry_delay="${DEPLOY_CANARY_RETRY_DELAY_SECONDS:-1}"
  local inter_attempt_delay="${DEPLOY_CANARY_INTER_ATTEMPT_DELAY_SECONDS:-0.3}"

  local success=0
  local code
  for attempt in $(seq 1 "${attempts}"); do
    code="$(
      curl -sS \
        --connect-timeout "${connect_timeout}" \
        -m "${max_time}" \
        -o /dev/null \
        -w "%{http_code}" \
        "${url}" || true
    )"
    if [ "${code}" = "000" ]; then
      sleep "${retry_delay}"
      code="$(
        curl -sS \
          --connect-timeout "${connect_timeout}" \
          -m "${max_time}" \
          -o /dev/null \
          -w "%{http_code}" \
          "${url}" || true
      )"
    fi
    echo "[post-deploy-canary] ${label} attempt=${attempt}/${attempts} status=${code}"
    if [ "${code}" = "200" ]; then
      success=$((success + 1))
    fi
    if [ "${attempt}" -lt "${attempts}" ]; then
      sleep "${inter_attempt_delay}"
    fi
  done

  local success_percent
  success_percent="$(awk -v s="${success}" -v a="${attempts}" 'BEGIN { printf "%.1f", (a == 0 ? 0 : (s * 100.0) / a) }')"
  local required_success
  required_success=$(( (attempts * min_success_percent + 99) / 100 ))

  echo "[post-deploy-canary] ${label} success=${success}/${attempts} (${success_percent}%), threshold=${min_success_percent}%"
  [ "${success}" -ge "${required_success}" ]
}

extract_canary_post_id() {
  local feed_url="$1"
  local connect_timeout="${DEPLOY_CANARY_CONNECT_TIMEOUT_SECONDS:-10}"
  local max_time="${DEPLOY_CANARY_MAX_TIME_SECONDS:-20}"
  local body=""
  local extract_attempt
  for extract_attempt in 1 2; do
    body="$(
      curl -sS \
        --connect-timeout "${connect_timeout}" \
        -m "${max_time}" \
        "${feed_url}" || true
    )"
    if [ -n "${body}" ] || [ "${extract_attempt}" -eq 2 ]; then
      break
    fi
    sleep 1
  done
  [ -z "${body}" ] && return 1

  local post_id=""
  if command -v python3 >/dev/null 2>&1; then
    post_id="$(
      printf '%s' "${body}" | python3 -c 'import json,sys; payload=json.load(sys.stdin); data=payload.get("data") or {}; content=data.get("content") or []; value=content[0].get("id") if content and isinstance(content[0], dict) else None; print(value if isinstance(value, int) else "")' 2>/dev/null || true
    )"
  fi

  if [ -z "${post_id}" ]; then
    post_id="$(printf '%s' "${body}" | grep -oE '"id":[0-9]+' | head -n 1 | cut -d: -f2 || true)"
  fi

  [ -n "${post_id}" ] && printf '%s' "${post_id}"
}
