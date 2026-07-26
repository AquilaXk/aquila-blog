#!/usr/bin/env bash

# Resolve the backend upstream the Caddy edge actually serves, and the upstream it is
# expected to serve.
#
# The tracked Caddyfile references backends through env placeholders
# ({$ADMIN_API_UPSTREAM:back_blue}:8080 / {$READ_API_UPSTREAM:back_blue}:8080) and
# runtime-split pins those keys to back_admin/back_read. Verifiers that matched only the
# literal back_blue/back_green form returned an empty upstream on a healthy split edge and
# reported drift that does not exist (#1418), so every consumer resolves through this one
# implementation instead of re-deriving the awk.
#
# usage:
#   caddy_upstream_probe.sh host                     upstream resolved from the host Caddyfile
#   caddy_upstream_probe.sh mounted                  upstream resolved inside the caddy container
#   caddy_upstream_probe.sh expected <active_backend> upstream the edge must serve
#
# host/mounted print an empty line when no upstream token can be resolved; callers treat
# that as drift. expected fails loudly instead, because an unresolvable expectation is a
# configuration error rather than an observation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-${SCRIPT_DIR}/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env.prod}"
CADDY_FILE="${CADDY_FILE:-${SCRIPT_DIR}/caddy/Caddyfile}"
CADDY_CONTAINER_FILE="${CADDY_CONTAINER_FILE:-/etc/caddy/Caddyfile}"

env_value() {
  local key="$1"
  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi
  awk -F= -v key="${key}" '$1 == key {print substr($0, index($0, "=") + 1); exit}' "${ENV_FILE}"
}

trim_quotes() {
  local value="$1"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

normalize_backend_name() {
  local value="$1"
  printf '%s' "${value//-/_}"
}

normalize_bool() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | on) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

host_env_value() {
  trim_quotes "$(env_value "$1")"
}

mounted_env_value() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T caddy \
    sh -lc "printenv $1" 2>/dev/null | tr -d '\r' | head -n 1
}

runtime_split_enabled() {
  normalize_bool "${RUNTIME_SPLIT_ENABLED:-$(host_env_value "RUNTIME_SPLIT_ENABLED")}"
}

host_upstream_token() {
  # A missing Caddyfile is an unresolvable observation, not a probe error: awk would exit
  # non-zero and set -e would abort instead of printing the empty line the host/mounted
  # contract promises. recover.sh only hides that behind `|| true`.
  [[ -f "${CADDY_FILE}" ]] || return 0
  awk '$1 == "reverse_proxy" && $2 ~ /^(back[-_](blue|green|read|admin):8080|\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080)$/ {print $2; exit}' "${CADDY_FILE}"
}

mounted_upstream_token() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T caddy \
    awk '$1 == "reverse_proxy" && $2 ~ /^(back[-_](blue|green|read|admin):8080|\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080)$/ {print $2; exit}' \
    "${CADDY_CONTAINER_FILE}" 2>/dev/null | tr -d '\r' | head -n 1
}

resolve_upstream_token() {
  local token="$1"
  local scope="$2"

  if [[ "${token}" =~ ^([a-zA-Z0-9_-]+):8080$ ]]; then
    normalize_backend_name "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "${token}" =~ ^\{\$([A-Z0-9_]+):([a-zA-Z0-9_-]+)\}:8080$ ]]; then
    local key="${BASH_REMATCH[1]}"
    local default_value
    local resolved_value
    default_value="$(normalize_backend_name "${BASH_REMATCH[2]}")"
    if [[ "${scope}" == "mounted" ]]; then
      resolved_value="$(normalize_backend_name "$(mounted_env_value "${key}")")"
    else
      resolved_value="$(normalize_backend_name "$(host_env_value "${key}")")"
    fi
    if [[ -n "${resolved_value}" ]]; then
      printf '%s' "${resolved_value}"
      return 0
    fi
    printf '%s' "${default_value}"
    return 0
  fi

  return 1
}

expected_upstream() {
  local active_backend="$1"

  # runtime-split never routes the edge at a blue/green colour: configure_runtime_split_env()
  # pins ADMIN_API_UPSTREAM/READ_API_UPSTREAM, and the first reverse_proxy token plus the
  # default handle that the readiness probe traverses both resolve through ADMIN_API_UPSTREAM.
  if [[ "$(runtime_split_enabled)" == "true" ]]; then
    local admin_upstream
    admin_upstream="$(normalize_backend_name "$(host_env_value "ADMIN_API_UPSTREAM")")"
    if [[ -z "${admin_upstream}" ]]; then
      echo "runtime-split enabled but ADMIN_API_UPSTREAM is missing in ${ENV_FILE}" >&2
      return 1
    fi
    printf '%s\n' "${admin_upstream}"
    return 0
  fi

  case "${active_backend}" in
    back_blue | back_green)
      printf '%s\n' "${active_backend}"
      ;;
    *)
      echo "unsupported active backend for upstream expectation: ${active_backend:-none}" >&2
      return 1
      ;;
  esac
}

main() {
  local mode="${1:-}"
  local token=""

  case "${mode}" in
    host)
      token="$(host_upstream_token)"
      resolve_upstream_token "${token}" "host" || true
      printf '\n'
      ;;
    mounted)
      token="$(mounted_upstream_token)"
      resolve_upstream_token "${token}" "mounted" || true
      printf '\n'
      ;;
    expected)
      expected_upstream "${2:-}"
      ;;
    *)
      echo "usage: $(basename "$0") host|mounted|expected <active_backend>" >&2
      return 2
      ;;
  esac
}

main "$@"
