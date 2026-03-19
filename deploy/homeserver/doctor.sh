#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
CADDY_HOST_FILE="${SCRIPT_DIR}/caddy/Caddyfile"
CADDY_CONTAINER_FILE="/etc/caddy/Caddyfile"
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

print_section "Env AI Summary Sanity"
ai_summary_enabled_raw="$(env_value "CUSTOM__AI__SUMMARY__ENABLED" | tr -d '"' | tr -d "'" | tr '[:upper:]' '[:lower:]')"
ai_summary_api_key="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__API_KEY")"
ai_summary_model="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__MODEL")"
echo "CUSTOM__AI__SUMMARY__ENABLED=${ai_summary_enabled_raw:-<empty>}"
echo "CUSTOM__AI__SUMMARY__GEMINI__MODEL=${ai_summary_model:-<empty>}"
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
grep -nE 'reverse_proxy back-(blue|green|active):8080' "${CADDY_HOST_FILE}" || true

print_section "Caddy Mount Sync"
host_upstream="$(awk '$1 == "reverse_proxy" && $2 ~ /^back-(blue|green):8080$/ {split($2, a, ":"); print a[1]; exit}' "${CADDY_HOST_FILE}" || true)"
mounted_upstream="$(compose exec -T caddy sh -lc "awk '\$1 == \"reverse_proxy\" && \$2 ~ /^back-(blue|green):8080$/ {split(\$2, a, \":\"); print a[1]; exit}' ${CADDY_CONTAINER_FILE}" 2>/dev/null | tr -d '\r' | head -n 1 || true)"
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
