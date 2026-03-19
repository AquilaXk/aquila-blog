#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"

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

print_section "Back Container States"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'blog_home-back_(blue|green)-1|NAMES' || true

print_section "Caddy Logs (tail 80)"
compose logs --no-color --tail=80 caddy || true

print_section "Cloudflared Logs (tail 80)"
compose logs --no-color --tail=80 cloudflared || true

print_section "Back Blue Logs (tail 120)"
compose logs --no-color --tail=120 back_blue || true

print_section "Back Green Logs (tail 120)"
compose logs --no-color --tail=120 back_green || true

print_section "DB Logs (tail 60)"
compose logs --no-color --tail=60 db_1 || true

print_section "Redis Logs (tail 60)"
compose logs --no-color --tail=60 redis_1 || true

print_section "Done"
echo "doctor.sh completed."
