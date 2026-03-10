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
print_env_key_status "PROD___SPRING__DATASOURCE__PASSWORD"
print_env_key_status "PROD___SPRING__DATA__REDIS__PASSWORD"
print_env_key_status "CUSTOM_PROD_BACKURL"
print_env_key_status "CUSTOM_PROD_FRONTURL"
print_env_key_status "CUSTOM_PROD_COOKIEDOMAIN"

print_section "Listening Ports (80/443/22/8080)"
ss -lntp '( sport = :80 or sport = :443 or sport = :22 or sport = :8080 )' || true

print_section "Compose PS"
compose ps || true

print_section "Back Container States"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'blog_home-back_(blue|green)-1|NAMES' || true

print_section "Caddy Logs (tail 80)"
compose logs --no-color --tail=80 caddy || true

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
