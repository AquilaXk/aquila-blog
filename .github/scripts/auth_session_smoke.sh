#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL is required}"
LOGIN_USERNAME="${LOGIN_USERNAME:?LOGIN_USERNAME is required}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:?LOGIN_PASSWORD is required}"
EXPECT_ADMIN="${EXPECT_ADMIN:-false}"

tmp_dir="$(mktemp -d)"
cookie_jar="${tmp_dir}/cookies.txt"
trap 'rm -rf "${tmp_dir}"' EXIT

request() {
  local name="$1"
  local method="$2"
  local url="$3"
  shift 3

  local body_file="${tmp_dir}/${name}.body"
  local header_file="${tmp_dir}/${name}.headers"
  local code

  code="$(
    curl -sS -c "${cookie_jar}" -b "${cookie_jar}" -D "${header_file}" -o "${body_file}" -w "%{http_code}" \
      -X "${method}" "${url}" "$@" || true
  )"

  echo "${code}"
}

require_status() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [ "${actual}" != "${expected}" ]; then
    echo "[${label}] expected status ${expected}, got ${actual}" >&2
    return 1
  fi
}

login_code="$(
  request login POST "${BASE_URL%/}/member/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    --data "{\"username\":\"${LOGIN_USERNAME}\",\"password\":\"${LOGIN_PASSWORD}\"}"
)"
require_status login "${login_code}" "200"
echo "[auth-smoke] login=200"

me_code="$(request me GET "${BASE_URL%/}/member/api/v1/auth/me")"
require_status me "${me_code}" "200"

if [ "${EXPECT_ADMIN}" = "true" ] && ! grep -q '"isAdmin"[[:space:]]*:[[:space:]]*true' "${tmp_dir}/me.body"; then
  echo "[me] expected admin account response" >&2
  exit 1
fi
echo "[auth-smoke] me=200"

logout_code="$(request logout DELETE "${BASE_URL%/}/member/api/v1/auth/logout")"
require_status logout "${logout_code}" "200"
echo "[auth-smoke] logout=200"

me_after_logout_code="$(request me_after_logout GET "${BASE_URL%/}/member/api/v1/auth/me")"
require_status me_after_logout "${me_after_logout_code}" "401"
echo "[auth-smoke] me_after_logout=401"
