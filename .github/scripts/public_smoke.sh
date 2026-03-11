#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:?BASE_URL is required}"
OAUTH_PROVIDER="${OAUTH_PROVIDER:-}"
OAUTH_REDIRECT_URL="${OAUTH_REDIRECT_URL:-${BASE_URL%/}/}"

tmp_dir="$(mktemp -d)"
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
    curl -sS -D "${header_file}" -o "${body_file}" -w "%{http_code}" -X "${method}" "${url}" "$@" || true
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

echo "[public-smoke] base_url=${BASE_URL}"

health_code="$(request health GET "${BASE_URL%/}/actuator/health")"
require_status health "${health_code}" "200"
echo "[public-smoke] health=200"

admin_code="$(request admin_profile GET "${BASE_URL%/}/member/api/v1/members/adminProfile")"
require_status admin_profile "${admin_code}" "200"
admin_body="$(cat "${tmp_dir}/admin_profile.body")"
admin_id="$(
  printf '%s' "${admin_body}" |
    grep -oE '"id"[[:space:]]*:[[:space:]]*[0-9]+' |
    head -n 1 |
    grep -oE '[0-9]+' || true
)"

if [ -z "${admin_id}" ]; then
  echo "[admin_profile] failed to extract admin id from response: ${admin_body}" >&2
  exit 1
fi
echo "[public-smoke] admin_profile=200 admin_id=${admin_id}"

profile_redirect_code="$(
  request admin_profile_redirect GET "${BASE_URL%/}/member/api/v1/members/${admin_id}/redirectToProfileImg"
)"
if [ "${profile_redirect_code}" != "302" ]; then
  echo "[admin_profile_redirect] expected status 302, got ${profile_redirect_code}" >&2
  exit 1
fi

if ! grep -iq '^location:' "${tmp_dir}/admin_profile_redirect.headers"; then
  echo "[admin_profile_redirect] missing Location header" >&2
  exit 1
fi
echo "[public-smoke] admin_profile_redirect=302"

posts_code="$(request post_list GET "${BASE_URL%/}/post/api/v1/posts?page=1&pageSize=1")"
require_status post_list "${posts_code}" "200"
echo "[public-smoke] post_list=200"

comments_code="$(request comments GET "${BASE_URL%/}/post/api/v1/posts/1/comments")"
if [ "${comments_code}" != "200" ] && [ "${comments_code}" != "404" ]; then
  echo "[comments] expected status 200 or 404, got ${comments_code}" >&2
  exit 1
fi
echo "[public-smoke] comments=${comments_code}"

me_code="$(request auth_me GET "${BASE_URL%/}/member/api/v1/auth/me")"
require_status auth_me "${me_code}" "401"
echo "[public-smoke] auth_me_without_cookie=401"

if [ -n "${OAUTH_PROVIDER}" ]; then
  oauth_code="$(
    request oauth_start GET \
      "${BASE_URL%/}/oauth2/authorization/${OAUTH_PROVIDER}?redirectUrl=${OAUTH_REDIRECT_URL}"
  )"
  case "${oauth_code}" in
    302|303)
      echo "[public-smoke] oauth_start=${oauth_code}"
      ;;
    *)
      echo "[oauth_start] expected redirect status, got ${oauth_code}" >&2
      exit 1
      ;;
  esac
fi
