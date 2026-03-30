#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_HOST_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
NETWORK_NAME="blog_home_default"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

print_section() {
  local title="$1"
  printf '\n===== %s =====\n' "${title}"
}

print_env_key_status() {
  local key="$1"
  if grep -qE "^${key}=" "${ENV_FILE}" 2>/dev/null; then
    echo "${key}=SET"
  else
    echo "${key}=MISSING"
  fi
}

env_value() {
  local key="$1"
  grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | tail -n 1 | cut -d '=' -f2-
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
  local api_domain="$1"
  local admin_email admin_password
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "notification sse probe: skip (missing CUSTOM__ADMIN__EMAIL or CUSTOM__ADMIN__PASSWORD)"
    return 0
  fi

  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
    set -eu
    api_domain="$1"
    admin_email="$2"
    admin_password="$3"
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
        -H "Host: ${api_domain}" \
        -H "Content-Type: application/json" \
        --data "${login_payload}" \
        "http://caddy:80/member/api/v1/auth/login" || true
    )"
    echo "login_status=${login_code}"
    if ! printf "%s" "${login_code}" | grep -Eq "^2[0-9][0-9]$"; then
      exit 11
    fi

    stream_body="$(
      curl -sS -N \
        --connect-timeout 3 \
        --max-time 35 \
        -b "${cookie_jar}" \
        -H "Host: ${api_domain}" \
        "http://caddy:80/member/api/v1/notifications/stream" || true
    )"
    printf "%s\n" "${stream_body}" | tr -d "\r"
  ' sh "${api_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
}

print_notification_sse_status() {
  local api_domain
  api_domain="$(trim_quotes "$(env_value "API_DOMAIN")")"
  if [[ -z "${api_domain}" ]]; then
    echo "notification sse: skip (missing API_DOMAIN)"
    return 0
  fi

  local probe_output
  probe_output="$(notification_sse_probe_output "${api_domain}")"
  if [[ "${probe_output}" == *"event: connected"* && "${probe_output}" == *"event: heartbeat"* ]]; then
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
      api_domain="$1"
      admin_email="$2"
      admin_password="$3"
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
          -H "Host: ${api_domain}" \
          -H "Content-Type: application/json" \
          --data "${login_payload}" \
          "http://caddy:80/member/api/v1/auth/login" || true
      )"
      if ! printf "%s" "${login_code}" | grep -Eq "^2[0-9][0-9]$"; then
        echo "HTTP_STATUS:000"
        exit 0
      fi
      response="$(
        curl -sS \
          --connect-timeout 3 \
          --max-time 10 \
          -b "${cookie_jar}" \
          -w $"\nHTTP_STATUS:%{http_code}\n" \
          -H "Host: ${api_domain}" \
          "http://caddy:80/system/api/v1/adm/notifications/stream" || true
      )"
      printf "%s\n" "${response}"
    ' sh "${api_domain}" "${admin_email}" "${admin_password}" 2>&1 || true
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
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 \
    --connect-timeout 3 \
    --max-time 10 \
    -o /dev/null \
    -s \
    -w '%{http_code}' \
    "http://grafana:3000/api/health" 2>/dev/null || true
}

inspect_grafana_origin_auth_proxy_headers() {
  local api_domain="$1"
  local grafana_domain="$2"
  local path="$3"
  local admin_email="$4"
  local admin_password="$5"
  docker run --rm --network "${NETWORK_NAME}" curlimages/curl:8.7.1 sh -lc '
    set -eu
    api_domain="$1"
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
        -H "Host: ${api_domain}" \
        -H "Content-Type: application/json" \
        --data "${login_payload}" \
        "http://caddy:80/member/api/v1/auth/login" || true
    )"
    if ! printf "%s" "${login_code}" | grep -Eq "^2[0-9][0-9]$"; then
      printf "HTTP/1.1 000 login_failed\r\n"
      exit 0
    fi
    curl -I -s \
      --connect-timeout 3 \
      --max-time 12 \
      -b "${cookie_jar}" \
      -H "Host: ${grafana_domain}" \
      "http://caddy:80${path}" || true
  ' sh "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}" 2>/dev/null || true
}

print_grafana_origin_status() {
  local api_domain grafana_domain path admin_email admin_password
  api_domain="$(trim_quotes "$(env_value "API_DOMAIN")")"
  grafana_domain="$(trim_quotes "$(env_value "GRAFANA_DOMAIN")")"
  path="$(monitoring_embed_candidate_path)"
  admin_email="$(trim_quotes "$(env_value "CUSTOM__ADMIN__EMAIL")")"
  admin_password="$(trim_quotes "$(env_value "CUSTOM__ADMIN__PASSWORD")")"

  if [[ -z "${grafana_domain}" || -z "${api_domain}" || -z "${admin_email}" || -z "${admin_password}" ]]; then
    echo "grafana origin auth-proxy: skip (missing GRAFANA_DOMAIN/API_DOMAIN/admin credentials)"
    return 0
  fi

  local headers status location xfo csp internal_health
  internal_health="$(inspect_grafana_internal_health)"
  headers="$(inspect_grafana_origin_auth_proxy_headers "${api_domain}" "${grafana_domain}" "${path}" "${admin_email}" "${admin_password}")"
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

  local headers status location xfo csp internal_health
  internal_health="$(inspect_grafana_internal_health)"
  headers="$(inspect_grafana_embed_headers "${url}")"
  status="$(printf '%s\n' "${headers}" | awk 'NR==1 {print $2}')"
  location="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="location" {print $2}' | tr -d '\r' | head -n 1)"
  xfo="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="x-frame-options" {print $2}' | tr -d '\r' | head -n 1)"
  csp="$(printf '%s\n' "${headers}" | awk -F': ' 'tolower($1)=="content-security-policy" {print $2}' | tr -d '\r' | head -n 1)"

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
  if [[ -n "${csp}" && "${csp}" == *"frame-ancestors"* ]]; then
    echo "WARN: grafana embed response includes frame-ancestors CSP; verify admin origin is allowed"
  fi
}

print_robots_status() {
  local api_domain
  api_domain="$(trim_quotes "$(env_value "API_DOMAIN")")"
  if [[ -z "${api_domain}" ]]; then
    echo "robots.txt: skip (missing API_DOMAIN)"
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
    -H "Host: ${api_domain}" \
    "http://caddy/robots.txt" >/dev/null 2>&1 || true

  curl -sS \
    --connect-timeout 5 \
    --max-time 15 \
    -D "${public_headers}" \
    -o "${public_body}" \
    "https://${api_domain}/robots.txt" >/dev/null 2>&1 || true

  local origin_code public_code
  origin_code="$(awk 'NR==1 {print $2}' "${origin_headers}" 2>/dev/null | tr -d '\r')"
  public_code="$(awk 'NR==1 {print $2}' "${public_headers}" 2>/dev/null | tr -d '\r')"
  [[ -n "${origin_code}" ]] || origin_code="none"
  [[ -n "${public_code}" ]] || public_code="none"

  local origin_disallow_all public_has_content_signals public_has_managed_block
  origin_disallow_all="false"
  public_has_content_signals="false"
  public_has_managed_block="false"
  if grep -q '^User-agent: \*$' "${origin_body}" 2>/dev/null && grep -q '^Disallow: /$' "${origin_body}" 2>/dev/null; then
    origin_disallow_all="true"
  fi
  if grep -q '^# As a condition of accessing this website' "${public_body}" 2>/dev/null; then
    public_has_content_signals="true"
  fi
  if grep -q '^# BEGIN Cloudflare Managed Content' "${public_body}" 2>/dev/null; then
    public_has_managed_block="true"
  fi

  echo "origin robots status: ${origin_code}"
  echo "origin robots disallow-all block: ${origin_disallow_all}"
  echo "public robots status: ${public_code}"
  echo "public robots content-signals preface: ${public_has_content_signals}"
  echo "public robots managed block: ${public_has_managed_block}"
  echo "-- origin robots preview --"
  sed -n '1,12p' "${origin_body}" 2>/dev/null || true
  echo "-- public robots preview --"
  sed -n '1,12p' "${public_body}" 2>/dev/null || true

  if [[ "${origin_code}" == "200" && "${origin_disallow_all}" == "true" && ( "${public_has_content_signals}" == "true" || "${public_has_managed_block}" == "true" ) ]]; then
    echo "INFO: public robots differs by design; Cloudflare managed robots/content-signals is prepending edge-managed content before origin robots."
  fi

  if [[ "${origin_code}" != "200" ]]; then
    echo "WARN: origin robots.txt is not returning 200 from Caddy. investigate local route/auth before blaming Cloudflare."
  fi

  if [[ "${public_code}" == "200" && "${origin_code}" != "200" && "${public_has_content_signals}" == "true" ]]; then
    echo "WARN: public robots is being served via Cloudflare managed/content-signals path while origin robots is unhealthy or absent."
  fi
}

extract_host() {
  local raw="$1"
  echo "${raw}" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s#:[0-9]+$##'
}

site_key() {
  local host="$1"

  if [[ -z "${host}" ]]; then
    echo ""
    return
  fi

  if [[ "${host}" == "localhost" || "${host}" == "127.0.0.1" ]]; then
    echo "${host}"
    return
  fi

  IFS='.' read -r -a labels <<< "${host}"
  local count="${#labels[@]}"

  if (( count <= 2 )); then
    echo "${host}"
    return
  fi

  local last=$((count - 1))
  local prev=$((count - 2))
  echo "${labels[prev]}.${labels[last]}"
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
print_env_key_status "API_DOMAIN"
print_env_key_status "CF_TUNNEL_TOKEN"
print_env_key_status "CLOUDFLARED_IMAGE"
print_env_key_status "DB_IMAGE"
print_env_key_status "MINIO_IMAGE"
print_env_key_status "PROD___SPRING__DATASOURCE__PASSWORD"
print_env_key_status "PROD___SPRING__DATA__REDIS__PASSWORD"
print_env_key_status "CUSTOM_PROD_BACKURL"
print_env_key_status "CUSTOM_PROD_FRONTURL"
print_env_key_status "CUSTOM_PROD_COOKIEDOMAIN"
print_env_key_status "CUSTOM__AI__SUMMARY__ENABLED"
print_env_key_status "CUSTOM__AI__SUMMARY__GEMINI__API_KEY"
print_env_key_status "CUSTOM__AI__SUMMARY__GEMINI__MODEL"
print_env_key_status "CUSTOM__AI__SUMMARY__QUOTA_FALLBACK_CACHE_TTL_SECONDS"
print_env_key_status "CUSTOM__AI__SUMMARY__QUOTA_CIRCUIT_OPEN_SECONDS"
print_env_key_status "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_THRESHOLD"
print_env_key_status "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_TTL_SECONDS"
print_env_key_status "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_OPEN_SECONDS"
print_env_key_status "CUSTOM__AI__SUMMARY__ADAPTIVE_RELAXED_FIRST_CONTENT_LENGTH"
print_env_key_status "CUSTOM__AI__SUMMARY__ADAPTIVE_RELAXED_FIRST_CODE_FENCE_COUNT"
print_env_key_status "CUSTOM__ADMIN__EMAIL"
print_env_key_status "CUSTOM__ADMIN__PASSWORD"

print_section "Steady Guard Cron"
if command -v crontab >/dev/null 2>&1; then
  crontab -l 2>/dev/null | grep 'steady_state_guard.sh' || echo "steady-state guard cron: not installed"
else
  echo "crontab command not found"
fi

print_section "Env Domain Consistency"
front_url="$(env_value "CUSTOM_PROD_FRONTURL")"
back_url="$(env_value "CUSTOM_PROD_BACKURL")"
cookie_domain="$(env_value "CUSTOM_PROD_COOKIEDOMAIN")"
api_domain="$(env_value "API_DOMAIN")"

front_host="$(extract_host "${front_url}")"
back_host="$(extract_host "${back_url}")"
cookie_site="$(site_key "${cookie_domain}")"
front_site="$(site_key "${front_host}")"
back_site="$(site_key "${back_host}")"
api_site="$(site_key "${api_domain}")"

echo "CUSTOM_PROD_FRONTURL host: ${front_host:-<empty>}"
echo "CUSTOM_PROD_BACKURL host:  ${back_host:-<empty>}"
echo "CUSTOM_PROD_COOKIEDOMAIN:  ${cookie_domain:-<empty>}"
echo "API_DOMAIN:                ${api_domain:-<empty>}"

if [[ -n "${front_site}" && -n "${back_site}" && "${front_site}" != "${back_site}" ]]; then
  echo "WARN: FRONTURL/BACKURL are cross-site (${front_site} vs ${back_site})"
fi

if [[ -n "${cookie_site}" && -n "${front_site}" && "${cookie_site}" != "${front_site}" ]]; then
  echo "WARN: COOKIEDOMAIN does not match FRONTURL site (${cookie_site} vs ${front_site})"
fi

if [[ -n "${cookie_site}" && -n "${back_site}" && "${cookie_site}" != "${back_site}" ]]; then
  echo "WARN: COOKIEDOMAIN does not match BACKURL site (${cookie_site} vs ${back_site})"
fi

if [[ -n "${api_site}" && -n "${back_site}" && "${api_site}" != "${back_site}" ]]; then
  echo "WARN: API_DOMAIN does not match BACKURL site (${api_site} vs ${back_site})"
fi

print_section "Grafana Embed Route"
print_grafana_origin_status
print_grafana_embed_status "$(monitoring_embed_candidate_url)"

print_section "Notification SSE"
print_notification_sse_status

print_section "Env AI Summary Sanity"
ai_summary_enabled_raw="$(env_value "CUSTOM__AI__SUMMARY__ENABLED" | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]')"
ai_summary_api_key="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__API_KEY")"
ai_summary_model="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__MODEL")"
ai_summary_quota_ttl="$(env_value "CUSTOM__AI__SUMMARY__QUOTA_FALLBACK_CACHE_TTL_SECONDS")"
ai_summary_quota_circuit_open="$(env_value "CUSTOM__AI__SUMMARY__QUOTA_CIRCUIT_OPEN_SECONDS")"
ai_summary_failure_threshold="$(env_value "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_THRESHOLD")"
ai_summary_failure_ttl="$(env_value "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_TTL_SECONDS")"
ai_summary_failure_open="$(env_value "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_OPEN_SECONDS")"
ai_summary_relaxed_first_length="$(env_value "CUSTOM__AI__SUMMARY__ADAPTIVE_RELAXED_FIRST_CONTENT_LENGTH")"
ai_summary_relaxed_first_code_fence="$(env_value "CUSTOM__AI__SUMMARY__ADAPTIVE_RELAXED_FIRST_CODE_FENCE_COUNT")"
echo "CUSTOM__AI__SUMMARY__ENABLED=${ai_summary_enabled_raw:-<empty>}"
echo "CUSTOM__AI__SUMMARY__GEMINI__MODEL=${ai_summary_model:-<empty>}"
echo "CUSTOM__AI__SUMMARY__QUOTA_FALLBACK_CACHE_TTL_SECONDS=${ai_summary_quota_ttl:-<default>}"
echo "CUSTOM__AI__SUMMARY__QUOTA_CIRCUIT_OPEN_SECONDS=${ai_summary_quota_circuit_open:-<default>}"
echo "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_THRESHOLD=${ai_summary_failure_threshold:-<default>}"
echo "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_TTL_SECONDS=${ai_summary_failure_ttl:-<default>}"
echo "CUSTOM__AI__SUMMARY__FAILURE_SIGNATURE_OPEN_SECONDS=${ai_summary_failure_open:-<default>}"
echo "CUSTOM__AI__SUMMARY__ADAPTIVE_RELAXED_FIRST_CONTENT_LENGTH=${ai_summary_relaxed_first_length:-<default>}"
echo "CUSTOM__AI__SUMMARY__ADAPTIVE_RELAXED_FIRST_CODE_FENCE_COUNT=${ai_summary_relaxed_first_code_fence:-<default>}"
if [[ "${ai_summary_enabled_raw}" == "true" && -z "${ai_summary_api_key}" ]]; then
  echo "WARN: AI summary is enabled but CUSTOM__AI__SUMMARY__GEMINI__API_KEY is empty."
fi

print_section "Listening Ports (80/443/22/8080)"
ss -lntp '( sport = :80 or sport = :443 or sport = :22 or sport = :8080 )' || true

print_section "Compose PS"
compose ps || true

print_section "Container Health"
for svc in back_blue back_green caddy cloudflared autoheal; do
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
grep -nE 'reverse_proxy back[-_](blue|green|active):8080' "${CADDY_HOST_FILE}" || true

print_section "Caddy Mount Sync"
host_upstream="$(awk '$1 == "reverse_proxy" && $2 ~ /^back[-_](blue|green):8080$/ {split($2, a, ":"); gsub("-", "_", a[1]); print a[1]; exit}' "${CADDY_HOST_FILE}" || true)"
mounted_upstream="$(compose exec -T caddy sh -lc "awk '\$1 == \"reverse_proxy\" && \$2 ~ /^back[-_](blue|green):8080$/ {split(\$2, a, \":\"); gsub(\"-\", \"_\", a[1]); print a[1]; exit}' ${CADDY_CONTAINER_FILE}" 2>/dev/null | tr -d '\r' | head -n 1 || true)"
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

print_section "Back Container States"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'blog_home-back_(blue|green)-1|NAMES' || true

print_section "Back Container Memory"
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' | grep -E 'blog_home-back_(blue|green)-1|NAME' || true

print_section "Caddy Logs (tail 80)"
compose logs --no-color --tail=80 caddy || true

print_section "Cloudflared Logs (tail 80)"
compose logs --no-color --tail=80 cloudflared || true

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
echo "doctor.sh completed."
