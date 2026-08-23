#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CURSOR_KEYRING_GUARD="${SCRIPT_DIR}/cursor_keyring_guard.sh"
MINIO_SERVICE_IDENTITY_GUARD="${SCRIPT_DIR}/minio_service_identity.sh"
CADDY_HOST_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
EDGE_NETWORK_NAME="blog_home_edge"
APP_NETWORK_NAME="blog_home_app"
OBSERVE_NETWORK_NAME="blog_home_observe"
DATA_NETWORK_NAME="blog_home_data"
NETWORK_NAME="${EDGE_NETWORK_NAME}"
TMP_DIR="$(mktemp -d)"
doctor_failures=0
trap 'rm -rf "${TMP_DIR}"' EXIT

compose() {
  bash "${SCRIPT_DIR}/materialize_service_env.sh" "${ENV_FILE}"
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

print_section() {
  local title="$1"
  printf '\n===== %s =====\n' "${title}"
}

print_minio_service_identity_status() {
  local minio_identity_status
  if [[ ! -x "${MINIO_SERVICE_IDENTITY_GUARD}" ]]; then
    echo "minio service identity: INVALID (guard missing)"
    return 1
  fi
  if minio_identity_status="$("${MINIO_SERVICE_IDENTITY_GUARD}" check "${ENV_FILE}" "${DATA_NETWORK_NAME}" 2>&1)"; then
    echo "minio service identity: VALID"
    printf '%s\n' "${minio_identity_status}"
    return 0
  fi
  echo "minio service identity: INVALID"
  # identity guard diagnostics contain only state/reason/version, never credentials.
  printf '%s\n' "${minio_identity_status}"
  return 1
}

print_env_key_status() {
  local key="$1"
  if grep -qE "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    echo "${key}=SET"
  else
    echo "${key}=MISSING"
  fi
}

# 키가 없는 것은 optional 조회의 정상 경로다. pipefail이 grep no-match(exit 1)를 파이프라인
# 종료 코드로 승격시키면 호출부 대입에서 set -e가 점검 전체를 중단시키므로 여기서 끊는다.
env_value() {
  local key="$1"
  grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | tail -n 1 | awk '
    {
      value = substr($0, index($0, "=") + 1)
      sub(/\r$/, "", value)
      print value
    }
  ' || return 0
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

notification_sse_probe_output() {
  local web_domain="$1"
  local admin_email admin_password
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "notification sse probe: skip (missing CUSTOM__ADMIN__EMAIL or CUSTOM__ADMIN__PASSWORD)"
    return 0
  fi

  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
    set -eu
    web_domain="$1"
    admin_email="$2"
    admin_password="$3"
    login_headers="$(mktemp)"
    trap "rm -f \"${login_headers}\"" EXIT
    login_payload="{\"email\":\"${admin_email}\",\"password\":\"${admin_password}\"}"
    login_code="$(
      curl -sS \
        --connect-timeout 3 \
        --max-time 12 \
        -D "${login_headers}" \
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

    # 로그인 응답은 host-only 만료용 빈 값 accessToken 쿠키를 실제 발급 쿠키보다 먼저 내보낸다.
    # 첫 매치를 집으면 항상 빈 토큰이 되므로 값이 있는 마지막 쿠키를 고른다.
    access_token="$(
      tr -d "\r" < "${login_headers}" \
        | grep -i "^Set-Cookie:[[:space:]]*accessToken=[^;]" \
        | tail -n 1 \
        | sed -n "s/^[^:]*:[[:space:]]*accessToken=\([^;]*\).*/\1/p"
    )"
    if [[ -z "${access_token}" ]]; then
      echo "login_access_token=missing"
      exit 12
    fi

    stream_body="$(
      curl -sS -N \
        --connect-timeout 3 \
        --max-time 35 \
        -H "Authorization: Bearer ${access_token}" \
        -H "Accept: text/event-stream" \
        -H "Host: ${web_domain}" \
        "http://caddy:80/member/api/v1/notifications/stream" || true
    )"
    printf "%s\n" "${stream_body}" | tr -d "\r"
  ' sh "${web_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
}

print_notification_sse_status() {
  local web_domain
  web_domain="$(trim_quotes "$(env_value "WEB_DOMAIN")")"
  if [[ -z "${web_domain}" ]]; then
    echo "notification sse: skip (missing WEB_DOMAIN)"
    return 0
  fi

  local probe_output
  probe_output="$(notification_sse_probe_output "${web_domain}")"
  if grep -qx 'event:[[:space:]]*connected' <<< "${probe_output}" && grep -qx 'event:[[:space:]]*heartbeat' <<< "${probe_output}"; then
    echo "notification sse probe: OK (connected+heartbeat)"
  else
    echo "notification sse probe: FAIL"
    printf '%s\n' "${probe_output}"
  fi

  local admin_email admin_password diagnostics_body diagnostics_code
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"
  if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "notification diagnostics: skip (missing CUSTOM__ADMIN__EMAIL or CUSTOM__ADMIN__PASSWORD)"
    return 0
  fi

  diagnostics_body="$(
    docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
      set -eu
      web_domain="$1"
      admin_email="$2"
      admin_password="$3"
      login_headers="$(mktemp)"
      trap "rm -f \"${login_headers}\"" EXIT
      login_payload="{\"email\":\"${admin_email}\",\"password\":\"${admin_password}\"}"
      login_code="$(
        curl -sS \
          --connect-timeout 3 \
          --max-time 12 \
          -D "${login_headers}" \
          -o /dev/null \
          -w "%{http_code}" \
          -H "Host: ${web_domain}" \
          -H "Content-Type: application/json" \
          --data "${login_payload}" \
          "http://caddy:80/member/api/v1/auth/login" || true
      )"
      if ! printf "%s" "${login_code}" | grep -Eq "^2[0-9][0-9]$"; then
        echo "HTTP_STATUS:000"
        exit 0
      fi
      # 로그인 응답은 host-only 만료용 빈 값 accessToken 쿠키를 실제 발급 쿠키보다 먼저 내보낸다.
      # 첫 매치를 집으면 항상 빈 토큰이 되므로 값이 있는 마지막 쿠키를 고른다.
      access_token="$(
        tr -d "\r" < "${login_headers}" \
          | grep -i "^Set-Cookie:[[:space:]]*accessToken=[^;]" \
          | tail -n 1 \
          | sed -n "s/^[^:]*:[[:space:]]*accessToken=\([^;]*\).*/\1/p"
      )"
      if [[ -z "${access_token}" ]]; then
        echo "HTTP_STATUS:000"
        echo "login_access_token=missing"
        exit 0
      fi
      response="$(
        curl -sS \
          --connect-timeout 3 \
          --max-time 10 \
          -H "Authorization: Bearer ${access_token}" \
          -w $"\nHTTP_STATUS:%{http_code}\n" \
          -H "Host: ${web_domain}" \
          "http://caddy:80/system/api/v1/adm/notifications/stream" || true
      )"
      printf "%s\n" "${response}"
    ' sh "${web_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
  )"
  diagnostics_code="$(printf '%s\n' "${diagnostics_body}" | awk -F: '/^HTTP_STATUS:/ {print $2}' | tr -d '\r' | tail -n1)"
  [[ -n "${diagnostics_code}" ]] || diagnostics_code="none"
  echo "notification diagnostics status: ${diagnostics_code}"
  printf '%s\n' "${diagnostics_body}" | sed '/^HTTP_STATUS:/d'
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
  printf '%s' "${url}"
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

inspect_grafana_embed_headers() {
  local url="$1"
  curl -I -s --max-time 10 "${url}" 2>/dev/null || true
}

inspect_grafana_internal_health() {
  docker run --rm --network "${OBSERVE_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://grafana:3000/api/health" 2>/dev/null || true
}

inspect_loki_internal_ready() {
  docker run --rm --network "${OBSERVE_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://loki:3100/ready" 2>/dev/null || true
}

inspect_promtail_internal_ready() {
  docker run --rm --network "${OBSERVE_NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://promtail:9080/ready" 2>/dev/null || true
}

inspect_grafana_loki_datasource_status() {
  local admin_user admin_password response code
  admin_user="$(trim_quotes "$(env_value "GRAFANA_ADMIN_USER")")"
  admin_password="$(trim_quotes "$(env_value "GRAFANA_ADMIN_PASSWORD")")"
  [[ -n "${admin_user}" ]] || admin_user="admin"
  [[ -n "${admin_password}" ]] || admin_password="change_me_grafana_password"

  response="$(
    docker run --rm --network "${OBSERVE_NETWORK_NAME}" curlimages/curl:8.7.1 \
      --connect-timeout 3 \
      --max-time 10 \
      -sS \
      -u "${admin_user}:${admin_password}" \
      -w $'\nHTTP_STATUS:%{http_code}\n' \
      "http://grafana:3000/api/datasources/uid/loki" 2>/dev/null || true
  )"
  code="$(printf '%s\n' "${response}" | awk -F: '/^HTTP_STATUS:/ {print $2}' | tr -d '\r' | tail -n 1)"
  [[ -n "${code}" ]] || code="none"
  if [[ "${code}" == "200" ]] && printf '%s' "${response}" | grep -q '"uid":"loki"'; then
    printf '%s' "${code}"
    return 0
  fi
  printf '%s' "${code}"
  return 1
}

print_monitoring_stack_status() {
  local loki_ready promtail_ready grafana_loki_ds
  loki_ready="$(inspect_loki_internal_ready)"
  promtail_ready="$(inspect_promtail_internal_ready)"
  grafana_loki_ds="$(inspect_grafana_loki_datasource_status || true)"
  [[ -n "${grafana_loki_ds}" ]] || grafana_loki_ds="none"

  echo "loki internal ready: ${loki_ready:-none}"
  echo "promtail internal ready: ${promtail_ready:-none}"
  echo "grafana loki datasource uid status: ${grafana_loki_ds}"

  if [[ "${loki_ready}" != "200" ]]; then
    echo "WARN: loki /ready is not 200; check loki container and storage mount."
  fi
  if [[ "${promtail_ready}" != "200" ]]; then
    echo "WARN: promtail /ready is not 200; check docker.sock/containers mount and promtail config."
  fi
  if [[ "${grafana_loki_ds}" != "200" ]]; then
    echo "WARN: grafana datasource uid=loki is not healthy."
  fi
}

inspect_grafana_origin_auth_proxy_headers() {
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
    login_headers="$(mktemp)"
    trap "rm -f \"${login_headers}\"" EXIT
    login_payload="{\"email\":\"${admin_email}\",\"password\":\"${admin_password}\"}"
    login_code="$(
      curl -sS \
        --connect-timeout 3 \
        --max-time 12 \
        -D "${login_headers}" \
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
    # 로그인 응답은 host-only 만료용 빈 값 accessToken 쿠키를 실제 발급 쿠키보다 먼저 내보낸다.
    # 첫 매치를 집으면 항상 빈 토큰이 되므로 값이 있는 마지막 쿠키를 고른다.
    access_token="$(
      tr -d "\r" < "${login_headers}" \
        | grep -i "^Set-Cookie:[[:space:]]*accessToken=[^;]" \
        | tail -n 1 \
        | sed -n "s/^[^:]*:[[:space:]]*accessToken=\([^;]*\).*/\1/p"
    )"
    if [[ -z "${access_token}" ]]; then
      printf "HTTP/1.1 000 missing_access_token\r\n"
      exit 0
    fi
    curl -I -s \
      --connect-timeout 3 \
      --max-time 12 \
      -H "Authorization: Bearer ${access_token}" \
      -H "Host: ${grafana_domain}" \
      "http://caddy:80${path}" || true
  ' sh "${web_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}" 2>/dev/null || true
}

print_grafana_origin_status() {
  local web_domain grafana_domain path admin_email admin_password
  web_domain="$(trim_quotes "$(env_value "WEB_DOMAIN")")"
  grafana_domain="$(trim_quotes "$(env_value "GRAFANA_DOMAIN")")"
  path="$(monitoring_embed_candidate_path)"
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${grafana_domain}" || -z "${web_domain}" || -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "grafana origin auth-proxy: skip (missing GRAFANA_DOMAIN/WEB_DOMAIN/admin credentials)"
    return 0
  fi

  local headers status location xfo csp internal_health
  internal_health="$(inspect_grafana_internal_health)"
  headers="$(inspect_grafana_origin_auth_proxy_headers "${web_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}")"
  status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
  location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
  xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
  csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"

  echo "grafana origin host: ${grafana_domain}"
  echo "grafana origin path: ${path}"
  echo "grafana internal health: ${internal_health:-none}"
  echo "grafana origin auth status: ${status:-none}"
  echo "grafana origin location: ${location:-<none>}"
  echo "grafana origin x-frame-options: ${xfo:-<none>}"
  if [[ -n "${csp}" ]]; then
    echo "grafana origin csp: ${csp}"
  fi
}

print_grafana_embed_status() {
  local url="$1"
  if [[ -z "${url}" ]]; then
    echo "grafana embed: skip (no NEXT_PUBLIC_MONITORING_EMBED_URL / GRAFANA_DOMAIN)"
    return 0
  fi

  if ! is_grafana_embed_url "${url}"; then
    echo "grafana embed: skip (non-grafana embed url: ${url})"
    return 0
  fi

  local headers status location xfo csp frame_ancestors internal_health
  internal_health="$(inspect_grafana_internal_health)"
  headers="$(inspect_grafana_embed_headers "${url}")"
  status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
  location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
  xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
  csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"
  frame_ancestors="$(printf '%s' "${csp}" | sed -E 's/.*frame-ancestors//; s/;.*$//' | tr -d '[:space:]')"

  echo "grafana public embed url: ${url}"
  echo "grafana internal health: ${internal_health:-none}"
  echo "grafana public embed status: ${status:-none}"
  echo "grafana public embed location: ${location:-<none>}"
  echo "grafana public embed x-frame-options: ${xfo:-<none>}"
  if [[ -n "${csp}" ]]; then
    echo "grafana embed csp: ${csp}"
  fi

  if [[ "${internal_health}" != "200" ]]; then
    echo "WARN: grafana internal /api/health is not 200; grafana container or upstream health를 먼저 확인하세요."
  fi
  if [[ "${status}" == "401" || "${status}" == "403" ]]; then
    echo "INFO: grafana embed route is protected by auth.proxy (unauthenticated probe returned ${status})."
  fi
  if [[ -n "${location}" && "${location}" == *"/login"* ]]; then
    echo "WARN: grafana embed route redirects to /login; auth.proxy 대신 grafana login flow가 노출되고 있습니다."
  fi
  if [[ -n "${xfo}" && "${xfo}" =~ [Dd][Ee][Nn][Yy]|[Ss][Aa][Mm][Ee][Oo][Rr][Ii][Gg][Ii][Nn] ]]; then
    echo "WARN: grafana embed response still sends frame-blocking X-Frame-Options=${xfo}"
  fi
  if [[ -z "${csp}" || "${csp}" != *"frame-ancestors"* ]]; then
    echo "WARN: grafana embed response missing frame-ancestors CSP; admin origin allowlist required"
  elif [[ -z "${frame_ancestors}" ]]; then
    echo "WARN: grafana embed frame-ancestors allowlist is empty; ADMIN_EMBED_ORIGINS is unset or empty"
  elif [[ "${frame_ancestors}" != *"aquilaxk.site"* && "${frame_ancestors}" != *"*"* ]]; then
    echo "WARN: grafana embed frame-ancestors may omit admin origin allowlist: ${csp}"
  else
    echo "INFO: grafana embed CSP keeps frame-ancestors admin origin allowlist"
  fi
}

print_robots_status() {
  local web_domain
  web_domain="$(trim_quotes "$(env_value "WEB_DOMAIN")")"
  if [[ -z "${web_domain}" ]]; then
    echo "robots.txt: skip (missing WEB_DOMAIN)"
    return 0
  fi

  local origin_headers="${TMP_DIR}/robots-origin.headers"
  local origin_body="${TMP_DIR}/robots-origin.body"
  local public_headers="${TMP_DIR}/robots-public.headers"
  local public_body="${TMP_DIR}/robots-public.body"

  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -sS \
    -D "${origin_headers}" \
    -o "${origin_body}" \
    -H "Host: ${web_domain}" \
    "http://caddy/robots.txt" >/dev/null 2>&1 || true

  curl -sS \
    --connect-timeout 5 \
    --max-time 15 \
    -D "${public_headers}" \
    -o "${public_body}" \
    "https://${web_domain}/robots.txt" >/dev/null 2>&1 || true

  # 헤더 파일이 없으면 awk가 exit 2로 끝나고 pipefail이 이를 대입 실패로 만들어 점검이 중단된다.
  # 응답을 못 받은 상태는 아래 none 처리와 WARN이 이미 담당한다.
  local origin_code public_code
  origin_code="$(awk 'NR==1 {print $2}' "${origin_headers}" 2>/dev/null | tr -d '\r' || true)"
  public_code="$(awk 'NR==1 {print $2}' "${public_headers}" 2>/dev/null | tr -d '\r' || true)"
  [[ -n "${origin_code}" ]] || origin_code="none"
  [[ -n "${public_code}" ]] || public_code="none"

  local origin_disallow_all origin_has_sitemap public_has_content_signals public_has_managed_block
  origin_disallow_all="false"
  origin_has_sitemap="false"
  public_has_content_signals="false"
  public_has_managed_block="false"
  if grep -q '^User-agent: \*$' "${origin_body}" 2>/dev/null && grep -q '^Disallow: /$' "${origin_body}" 2>/dev/null; then
    origin_disallow_all="true"
  fi
  if grep -qi '^Sitemap:' "${origin_body}" 2>/dev/null; then
    origin_has_sitemap="true"
  fi
  if grep -q '^# As a condition of accessing this website' "${public_body}" 2>/dev/null; then
    public_has_content_signals="true"
  fi
  if grep -q '^# BEGIN Cloudflare Managed Content' "${public_body}" 2>/dev/null; then
    public_has_managed_block="true"
  fi

  echo "origin robots status: ${origin_code}"
  echo "origin robots disallow-all block: ${origin_disallow_all}"
  echo "origin robots sitemap line: ${origin_has_sitemap}"
  echo "public robots status: ${public_code}"
  echo "public robots content-signals preface: ${public_has_content_signals}"
  echo "public robots managed block: ${public_has_managed_block}"
  echo "-- origin robots preview --"
  sed -n '1,12p' "${origin_body}" 2>/dev/null || true
  echo "-- public robots preview --"
  sed -n '1,12p' "${public_body}" 2>/dev/null || true

  if [[ "${origin_code}" == "200" && ( "${public_has_content_signals}" == "true" || "${public_has_managed_block}" == "true" ) ]]; then
    echo "INFO: public robots differs by design; Cloudflare managed robots/content-signals is prepending edge-managed content before origin robots."
  fi

  if [[ "${origin_code}" != "200" ]]; then
    echo "WARN: origin robots.txt is not returning 200 from Caddy. investigate local route/auth before blaming Cloudflare."
  fi

  # 이 probe는 #1596 전에는 API 호스트를 봤고 거기서는 `Disallow: /`가 정답이었다. 지금 보는
  # 호스트는 공개 web 호스트이며 front/public/robots.txt가 정본이다 - 여기서 disallow-all이
  # 보이면 라우팅이 backend vhost로 새어 블로그 전체가 색인에서 빠진다.
  if [[ "${origin_code}" == "200" && "${origin_disallow_all}" == "true" ]]; then
    echo "WARN: the public web host is serving a disallow-all robots.txt - the blog would be deindexed. front/public/robots.txt must answer on ${web_domain}."
  fi

  if [[ "${origin_code}" == "200" && "${origin_disallow_all}" == "false" && "${origin_has_sitemap}" == "false" ]]; then
    echo "WARN: origin robots.txt has no Sitemap line - crawlers lose the sitemap entry point."
  fi

  if [[ "${public_code}" == "200" && "${origin_code}" != "200" && "${public_has_content_signals}" == "true" ]]; then
    echo "WARN: public robots is being served via Cloudflare managed/content-signals path while origin robots is unhealthy or absent."
  fi
}

extract_host() {
  local raw="$1"
  echo "${raw}" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s#:[0-9]+$##'
}

# 인증 쿠키 Domain은 front/back 호스트의 공통 접미사로 계산된다(AuthCookieDomainPolicy).
# 마지막 두 레이블만 비교하면 apex(aquilaxk.site)와 blog.aquilaxk.site가 같은 값으로 축약돼,
# 쿠키가 상위 도메인으로 새는 오설정을 WARN 없이 통과시킨다. 전체 호스트로 비교한다.
is_strict_subdomain_of() {
  local candidate="$1"
  local parent="$2"

  if [[ -z "${candidate}" || -z "${parent}" ]]; then
    return 1
  fi
  if [[ "${candidate}" == "${parent}" ]]; then
    return 1
  fi
  [[ "${candidate}" == *".${parent}" ]]
}

# 공개 API가 web 호스트 밖으로 나가지 않는 조합은 둘이다: 같은 호스트(same-origin, #1575) 또는
# 진성 하위. 동등을 여기서 허용하되 빈 값은 계속 거짓이다 - 빈 값을 참으로 두면 .env.prod에서
# 호스트가 통째로 빠졌을 때 점검이 조용히 사라진다.
is_same_or_strict_subdomain_of() {
  local candidate="$1"
  local parent="$2"

  if [[ -z "${candidate}" || -z "${parent}" ]]; then
    return 1
  fi
  if [[ "${candidate}" == "${parent}" ]]; then
    return 0
  fi
  [[ "${candidate}" == *".${parent}" ]]
}

print_section "Basic Info"
echo "Host: $(hostname)"
echo "Time: $(date -Is)"
echo "Script dir: ${SCRIPT_DIR}"
echo "Compose file: ${COMPOSE_FILE}"
echo "Env file: ${ENV_FILE}"

print_section "Docker"
docker --version || true
docker compose version || true
docker_engine_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null | tr -d '\r' || true)"
echo "docker engine: ${docker_engine_version:-unknown}"
if [[ "${docker_engine_version}" =~ ^29\.1\.0([.-]|$) ]]; then
  echo "WARN: docker engine 29.1.0 is blocked for deploy (known regression)"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  print_section "ERROR"
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

print_section "Env Required Keys"
# front (#1538): WEB_DOMAIN이 비면 web vhost가 web.localhost 기본값에 머물러 공개 도메인이
# 404가 되고, BACKEND_INTERNAL_URL이 비면 컨테이너는 healthy인 채 모든 SSR이 500이 된다.
# 둘 다 컨테이너 밖에서는 보이지 않으므로 여기서 노출한다. #1596으로 구 API 호스트가 접힌 뒤
# WEB_DOMAIN은 공개 진입점이자 이 도구의 모든 edge probe가 쓰는 유일한 Host다.
print_env_key_status "WEB_DOMAIN"
print_env_key_status "FRONT_BLUE_IMAGE"
print_env_key_status "FRONT_GREEN_IMAGE"
print_env_key_status "BACKEND_INTERNAL_URL"
print_env_key_status "COMPOSE_PROFILES"
print_env_key_status "ADMIN_EMBED_ORIGINS"
print_env_key_status "CF_TUNNEL_TOKEN"
print_env_key_status "CLOUDFLARED_IMAGE"
print_env_key_status "DB_IMAGE"
print_env_key_status "MINIO_IMAGE"
print_env_key_status "PROD___SPRING__DATASOURCE__USERNAME"
print_env_key_status "PROD___SPRING__DATASOURCE__PASSWORD"
print_env_key_status "PROD___SPRING__FLYWAY__USER"
print_env_key_status "PROD___SPRING__FLYWAY__PASSWORD"
print_env_key_status "PROD___POSTGRES__PASSWORD"
print_env_key_status "PROD___SPRING__DATA__REDIS__PASSWORD"
print_env_key_status "CUSTOM_PROD_BACKURL"
print_env_key_status "CUSTOM_PROD_FRONTURL"
print_env_key_status "CUSTOM_PROD_COOKIEDOMAIN"
print_env_key_status "CUSTOM__ADMIN__EMAIL"
print_env_key_status "CUSTOM__ADMIN__PASSWORD"

print_section "Steady Guard Cron"
if command -v crontab >/dev/null 2>&1; then
  crontab -l 2>/dev/null | grep 'steady_state_guard.sh' || echo "steady-state guard cron: not installed"
else
  echo "crontab command not found"
fi

print_section "Env Domain Consistency"
# .env.prod는 값에 따옴표를 붙여 적을 수 있다. 여기서 벗기지 않으면 host 추출과 아래 snapshot
# 점검의 Host 헤더/URL이 따옴표째 조립돼 라우트가 정상인데도 상시 실패로 보고된다.
front_url="$(trim_quotes "$(env_value "CUSTOM_PROD_FRONTURL")")"
back_url="$(trim_quotes "$(env_value "CUSTOM_PROD_BACKURL")")"
cookie_domain="$(trim_quotes "$(env_value "CUSTOM_PROD_COOKIEDOMAIN")")"
web_domain="$(trim_quotes "$(env_value "WEB_DOMAIN")")"

front_host="$(extract_host "${front_url}")"
back_host="$(extract_host "${back_url}")"

echo "CUSTOM_PROD_FRONTURL host: ${front_host:-<empty>}"
echo "CUSTOM_PROD_BACKURL host:  ${back_host:-<empty>}"
echo "CUSTOM_PROD_COOKIEDOMAIN:  ${cookie_domain:-<empty>}"
echo "WEB_DOMAIN:                ${web_domain:-<empty>}"

# 쿠키 스코프는 front 호스트 그 자체여야 하고, 공개 API는 그 호스트 자신이거나(same-origin,
# #1575의 목표 위상) 그 하위여야 한다. front가 쿠키 도메인의 형제이거나 API가 형제 subtree에
# 있으면 공통 접미사가 한 단계 위로 올라가, 우리 소유가 아닌 상위 호스트로 세션 쿠키가 전송된다.
#
# front/back 관계 점검은 cookie_domain이 비어 있어도 사라지면 안 된다. 쿠키 도메인이 통째로
# 빠진 .env.prod가 가장 위험한 상태인데, 그때 점검이 함께 사라지면 아무 WARN도 안 나온다.
# 전환 창 동안에는 이 WARN이 "예상된 상태"인 분기가 있었다. #1596으로 구 API 호스트가 접히고
# WEB_DOMAIN이 배포 필수가 된 뒤에는 그런 위상이 배포될 수 없으므로, 이 조합은 언제나 실제 위험이다.
if [[ -n "${front_host}" && -n "${back_host}" ]] \
  && ! is_same_or_strict_subdomain_of "${back_host}" "${front_host}"; then
  echo "WARN: BACKURL host must be the FRONTURL host or sit strictly under it (${back_host} vs ${front_host}) - the shared suffix widens the auth cookie scope above ${front_host}"
fi

if [[ -n "${cookie_domain}" && -n "${front_host}" && "${cookie_domain}" != "${front_host}" ]]; then
  echo "WARN: COOKIEDOMAIN must equal FRONTURL host (${cookie_domain} vs ${front_host}) - auth cookies would reach hosts above ${front_host}"
fi

if [[ -n "${cookie_domain}" && -n "${back_host}" ]] \
  && ! is_same_or_strict_subdomain_of "${back_host}" "${cookie_domain}"; then
  echo "WARN: BACKURL host must be the COOKIEDOMAIN host or sit strictly under it (${back_host} vs ${cookie_domain})"
fi

# LEGACY_API_DOMAIN은 host 이전 창에만 설정하는 두 번째 site address다(#1596 이후 유일하게
# 남은 host 기반 주소). WEB_DOMAIN과 같은 값이면 두 site block이 한 주소를 공유해 edge 전체가
# 기동하지 못한다. 계약이 이미 막지만 doctor는 손으로 편집된 .env.prod를 보는 도구다.
#
# 비교 대상은 FRONTURL host가 아니라 WEB_DOMAIN이다. 실제로 Caddy site address로 보간되는 값이
# WEB_DOMAIN이라, FRONTURL만 보면 정확히 그 충돌 조합을 놓친다.
legacy_api_domain="$(trim_quotes "$(env_value "LEGACY_API_DOMAIN")")"
echo "LEGACY_API_DOMAIN:         ${legacy_api_domain:-<empty>}"
if [[ -n "${legacy_api_domain}" && -n "${web_domain}" && "${legacy_api_domain}" == "${web_domain}" ]]; then
  echo "WARN: LEGACY_API_DOMAIN duplicates WEB_DOMAIN (${web_domain}) - two Caddy site blocks would share one address and the edge would fail to start"
fi
if [[ -n "${legacy_api_domain}" ]]; then
  echo "WARN: LEGACY_API_DOMAIN is set - a host migration window is open and an extra host-based backend address is being served"
fi

print_section "Grafana Embed Route"
print_grafana_origin_status
print_grafana_embed_status "$(monitoring_embed_candidate_url)"

print_section "Monitoring Stack (Loki/Promtail)"
print_monitoring_stack_status

print_section "Notification SSE"
print_notification_sse_status

print_section "Listening Ports (80/443/22/8080)"
ss -lntp '( sport = :80 or sport = :443 or sport = :22 or sport = :8080 )' || true

print_section "Compose PS"
compose ps || true

print_section "Container Health"
# front_blue/front_green report MISSING until the front profile is enabled (#1538). That is the
# intended read-only signal: the front tier is visible in the checkup before it is deployed.
for svc in back_blue back_green back_read back_admin back_worker front_blue front_green caddy cloudflared autoheal loki promtail prometheus grafana; do
  cid="$(compose ps -q "${svc}" 2>/dev/null | head -n 1 || true)"
  if [[ -z "${cid}" ]]; then
    echo "${svc}: MISSING"
    continue
  fi

  docker inspect --format \
    "${svc}: status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restartCount={{.RestartCount}} oomKilled={{.State.OOMKilled}} exitCode={{.State.ExitCode}}" \
    "${cid}" 2>/dev/null || true
done

print_section "Caddy Upstream"
grep -nE 'reverse_proxy (\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080|back[-_](blue|green|read|admin|active):8080)' "${CADDY_HOST_FILE}" || true
echo "ADMIN_API_UPSTREAM=$(trim_quotes "$(env_value "ADMIN_API_UPSTREAM")")"
echo "READ_API_UPSTREAM=$(trim_quotes "$(env_value "READ_API_UPSTREAM")")"
# 위 grep은 :8080 backend upstream만 매치한다. front는 :3000이라 별도로 출력한다.
# placeholder와 리터럴을 모두 매치해야 한다: cutover(#1539)가 활성 색을 리터럴로 고정하므로,
# placeholder 형태만 보면 배포가 끝난 뒤에는 이 줄이 아무것도 출력하지 않는다.
grep -nE 'reverse_proxy (\{\$WEB_UPSTREAM:front[-_](blue|green)\}|front[-_](blue|green)):3000' "${CADDY_HOST_FILE}" || true
echo "WEB_UPSTREAM=$(trim_quotes "$(env_value "WEB_UPSTREAM")")"

print_section "Caddy Mount Sync"
host_upstream="$(bash "${SCRIPT_DIR}/caddy_upstream_probe.sh" host 2>/dev/null || true)"
mounted_upstream="$(bash "${SCRIPT_DIR}/caddy_upstream_probe.sh" mounted 2>/dev/null || true)"
legacy_back_active="false"
if compose exec -T caddy sh -lc "grep -Eq 'back[-_]active:8080' ${CADDY_CONTAINER_FILE}" >/dev/null 2>&1; then
  legacy_back_active="true"
fi
host_sha="$(sha256sum "${CADDY_HOST_FILE}" 2>/dev/null | awk '{print $1}' || true)"
mounted_sha="$(compose exec -T caddy sh -lc "sha256sum ${CADDY_CONTAINER_FILE} | awk '{print \$1}'" 2>/dev/null | tr -d '\r' | head -n 1 || true)"
echo "host_upstream=${host_upstream:-<none>}"
echo "mounted_upstream=${mounted_upstream:-<none>}"
echo "host_sha=${host_sha:-<none>}"
echo "mounted_sha=${mounted_sha:-<none>}"
echo "mounted_legacy_back_active=${legacy_back_active}"
if [[ -n "${host_upstream}" && "${host_upstream}" != "${mounted_upstream}" ]]; then
  echo "WARN: host/mounted Caddy upstream mismatch"
fi
if [[ -n "${host_sha}" && -n "${mounted_sha}" && "${host_sha}" != "${mounted_sha}" ]]; then
  echo "WARN: host/mounted Caddy file checksum mismatch"
fi
if [[ "${legacy_back_active}" == "true" ]]; then
  echo "WARN: mounted Caddyfile still has legacy back_active token"
fi

print_section "Robots.txt (Origin vs Public)"
print_robots_status

print_section "Notification Snapshot Route (Origin vs Public)"
internal_snapshot_code="$(
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 3 \
    --max-time 8 \
    -H "Host: ${web_domain}" \
    "http://caddy:80/member/api/v1/notifications/snapshot" || true
)"
public_snapshot_code="$(
  curl -sS --connect-timeout 5 -m 15 -o /dev/null -w "%{http_code}" \
    "https://${web_domain}/member/api/v1/notifications/snapshot" || true
)"
echo "internal_snapshot=${internal_snapshot_code:-none}"
echo "public_snapshot=${public_snapshot_code:-none}"

print_section "MinIO Service Identity"
if ! print_minio_service_identity_status; then
  doctor_failures=$((doctor_failures + 1))
fi

print_section "Cursor Signing Keyring"
if [[ ! -x "${CURSOR_KEYRING_GUARD}" ]]; then
  echo "cursor keyring: INVALID (guard missing)"
  doctor_failures=$((doctor_failures + 1))
elif cursor_keyring_status="$("${CURSOR_KEYRING_GUARD}" "${ENV_FILE}" 2>&1)"; then
  echo "cursor keyring: VALID"
  printf '%s\n' "${cursor_keyring_status}"
else
  echo "cursor keyring: INVALID"
  # guard의 오류는 버전/존재/만료 원인만 담고 key 원문은 절대 출력하지 않는다.
  printf '%s\n' "${cursor_keyring_status}"
  doctor_failures=$((doctor_failures + 1))
fi

print_section "Back Container States"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'blog_home-back_(blue|green|read|admin|worker)-1|NAMES' || true

print_section "Back Container Memory"
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' | grep -E 'blog_home-back_(blue|green|read|admin|worker)-1|NAME' || true

print_section "Front .next/cache Volume"
# 이 볼륨이 실제로 보존하는 것은 이미지 최적화 캐시(.next/cache/images)뿐이다. 이 앱은 Pages
# Router라 ISR 산출물은 .next/server/pages(이미지 레이어 안)에 쓰이고, fetch-cache는 App Router
# 전용이라 채워지지 않는다(#1538 실측). 따라서 컨테이너 교체 후 ISR HTML은 보존되지 않으며
# 새 색깔은 항상 cold ISR로 시작한다 - 그것이 현재 사실이고, 게이트도 보존을 전제하지 않는다.
#
# 여기서 보는 것은 "보존이 가능한 상태인가"다. 마운트가 빠지거나 마운트 지점이 root:root로
# 생성되면 /_next/image는 200을 반환하면서 캐시를 전혀 쓰지 못한다(#1538 실측) - 화면상 차이가
# 없어 조용히 열화되는 경로다.
for svc in front_blue front_green; do
  cid="$(compose ps -q "${svc}" 2>/dev/null | head -n 1 || true)"
  if [[ -z "${cid}" ]]; then
    echo "${svc}: MISSING (front profile off or not deployed)"
    continue
  fi
  mount_source="$(
    docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/.next/cache"}}{{.Name}}{{end}}{{end}}' \
      "${cid}" 2>/dev/null || true
  )"
  echo "${svc}: next_cache_volume=${mount_source:-<none>}"
  if [[ -z "${mount_source}" ]]; then
    echo "WARN: ${svc} has no named volume at /app/.next/cache; the image optimizer cache is lost on every replacement"
    continue
  fi
  # 소유자 출력만으로는 부족하다. 컨테이너 사용자가 쓰지 못하면 /_next/image는 계속 200을
  # 반환하면서 캐시 적중률만 0으로 굳는다(#1538 실측) - 출력만 하고 넘어가면 그 상태가 진단
  # 로그에서도 정상처럼 보인다. 쓰기 가능 여부를 명시적으로 판정해 WARN을 낸다.
  docker exec "${cid}" sh -lc 'ls -ld /app/.next/cache 2>/dev/null; ls /app/.next/cache 2>/dev/null | head -n 5' 2>/dev/null || true
  if docker exec "${cid}" sh -lc 'test -w /app/.next/cache' >/dev/null 2>&1; then
    echo "${svc}: next_cache_writable=yes"
  else
    echo "${svc}: next_cache_writable=no"
    echo "WARN: ${svc} cannot write /app/.next/cache; /_next/image keeps answering 200 with a permanently cold cache"
  fi
  image_cache_entries="$(docker exec "${cid}" sh -lc 'ls /app/.next/cache/images 2>/dev/null | wc -l' 2>/dev/null | tr -d '\r' || true)"
  echo "${svc}: image_cache_entries=${image_cache_entries:-unknown}"
done

print_section "Caddy Logs (tail 80)"
compose logs --no-color --tail=80 caddy || true

print_section "Cloudflared Logs (tail 80)"
compose logs --no-color --tail=80 cloudflared || true

print_section "Loki Logs (tail 80)"
compose logs --no-color --tail=80 loki || true

print_section "Promtail Logs (tail 80)"
compose logs --no-color --tail=80 promtail || true

print_section "Autoheal Logs (tail 80)"
compose logs --no-color --tail=80 autoheal || true

print_section "Back Blue Logs (tail 120)"
compose logs --no-color --tail=120 back_blue || true

print_section "Back Green Logs (tail 120)"
compose logs --no-color --tail=120 back_green || true

print_section "DB Logs (tail 60)"
compose logs --no-color --tail=60 db_1 || true

print_section "Redis Logs (tail 60)"
compose logs --no-color --tail=60 redis_1 || true

print_section "5xx Correlation (last 15m)"
compose logs --no-color --since=15m caddy > "${TMP_DIR}/caddy.log" 2>&1 || true
compose logs --no-color --since=15m back_blue > "${TMP_DIR}/back.log" 2>&1 || true
compose logs --no-color --since=15m db_1 > "${TMP_DIR}/db.log" 2>&1 || true

echo "[proxy] caddy 5xx top uri"
if grep -Eq '"status":[[:space:]]*5[0-9]{2}' "${TMP_DIR}/caddy.log"; then
  grep -E '"status":[[:space:]]*5[0-9]{2}' "${TMP_DIR}/caddy.log" \
    | sed -E 's#.*"uri":"([^"]+)".*"status":[[:space:]]*([0-9]{3}).*#\2 \1#' \
    | sort | uniq -c | sort -nr | head -n 15
else
  echo "no caddy 5xx access log in last 15m"
fi

echo "[app] back 5xx/error signature top"
if grep -Eq 'api_error|post_public_read_failed|unhandled_server_exception|app_exception status=5|Data integrity violation|Optimistic lock conflict' "${TMP_DIR}/back.log"; then
  grep -E 'api_error|post_public_read_failed|unhandled_server_exception|app_exception status=5|Data integrity violation|Optimistic lock conflict' "${TMP_DIR}/back.log" \
    | sed -E 's#^.*(api_error|post_public_read_failed|unhandled_server_exception|app_exception status=5[0-9]{2}|Data integrity violation|Optimistic lock conflict).*$#\1#' \
    | sort | uniq -c | sort -nr
else
  echo "no app error signature in last 15m"
fi

echo "[app] requestId 상위(오류 로그 기준)"
if grep -Eq 'rid=' "${TMP_DIR}/back.log"; then
  grep -E 'api_error|post_public_read_failed|unhandled_server_exception|app_exception status=5' "${TMP_DIR}/back.log" \
    | grep -Eo 'rid=[^ ]+' \
    | sort | uniq -c | sort -nr | head -n 10
else
  echo "requestId not found in app logs"
fi

echo "[db] postgres error signature top"
if grep -Eiq 'ERROR|FATAL|deadlock|canceling statement due to statement timeout|too many connections|remaining connection slots are reserved|could not obtain lock|out of shared memory' "${TMP_DIR}/db.log"; then
  grep -Ei 'ERROR|FATAL|deadlock|canceling statement due to statement timeout|too many connections|remaining connection slots are reserved|could not obtain lock|out of shared memory' "${TMP_DIR}/db.log" \
    | sed -E 's#^[^:]+:[[:space:]]*##' \
    | sort | uniq -c | sort -nr | head -n 20
else
  echo "no db error signature in last 15m"
fi

print_section "Done"
if [ "${doctor_failures}" -ne 0 ]; then
  echo "doctor.sh completed with ${doctor_failures} invalid identity check(s)." >&2
  exit "${doctor_failures}"
fi
echo "doctor.sh completed."
