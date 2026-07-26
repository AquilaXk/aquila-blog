#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

doctor="deploy/homeserver/doctor.sh"
if [ ! -f "${doctor}" ]; then
  echo "[test] ${doctor} is missing from the repository checkout" >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

fail() {
  echo "[test] $1" >&2
  exit 1
}

# doctor.sh는 docker와 홈서버 없이 통째로 실행할 수 없다. 그래서 검사 대상 로직만 원본 파일에서
# 떼어내 평가한다. 사본을 테스트에 적어 두면 원본이 회귀해도 통과하므로 항상 파일에서 읽는다.
extract_function() {
  awk -v head="$1() {" '
    index($0, head) == 1 { capture = 1 }
    capture { print }
    capture && $0 == "}" { exit }
  ' "${doctor}"
}

# 로그인 프로브 3곳(notification sse, notification diagnostics, grafana origin auth-proxy)이
# 같은 쿠키 선택 로직을 쓰는지까지 확인하려고 블록을 개별 파일로 뽑는다.
blocks_dir="${workdir}/access-token-blocks"
mkdir -p "${blocks_dir}"
awk -v outdir="${blocks_dir}" '
  /^[[:space:]]*access_token="\$\($/ { count += 1; capture = 1 }
  capture {
    line = $0
    sub(/^[[:space:]]+/, "", line)
    print line > (outdir "/block-" count ".sh")
  }
  capture && /^[[:space:]]*\)"$/ { capture = 0; close(outdir "/block-" count ".sh") }
' "${doctor}"

shopt -s nullglob
access_token_blocks=("${blocks_dir}"/block-*.sh)
shopt -u nullglob
if [ "${#access_token_blocks[@]}" -lt 3 ]; then
  fail "expected the three login probes to select accessToken from Set-Cookie, found ${#access_token_blocks[@]} selection blocks"
fi
for block in "${access_token_blocks[@]:1}"; do
  if ! diff -u "${access_token_blocks[0]}" "${block}" >/dev/null; then
    echo "[test] accessToken selection diverges between login probes" >&2
    diff -u "${access_token_blocks[0]}" "${block}" >&2 || true
    exit 1
  fi
done
access_token_selection="$(cat "${access_token_blocks[0]}")"

# 토큰이 하나도 없을 때 실패로 보고하는 분기(exit 12)까지 같이 평가한다.
missing_token_branch="$(
  awk '
    index($0, "if [[ -z \"${access_token}\" ]]; then") > 0 { capture = 1; buffer = "" }
    capture {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      buffer = buffer line "\n"
    }
    capture && /^[[:space:]]*fi$/ {
      capture = 0
      if (buffer ~ /exit 12/) {
        printf "%s", buffer
        exit
      }
    }
  ' "${doctor}"
)"
if [ -z "${missing_token_branch}" ]; then
  fail "expected the notification sse probe to keep reporting a missing accessToken as a failure"
fi
probe_snippet="${access_token_selection}"$'\n'"${missing_token_branch}"

select_access_token() {
  # shellcheck disable=SC2034  # 원본에서 떼어 온 선택 로직이 eval 시점에 읽는다
  local login_headers="$1"
  local access_token=""
  eval "${access_token_selection}"
  printf '%s' "${access_token}"
}

run_probe_snippet() {
  local headers_file="$1"
  set +e
  probe_output="$(
    # shellcheck disable=SC2034  # 원본에서 떼어 온 프로브 조각이 eval 시점에 읽는다
    login_headers="${headers_file}"
    eval "${probe_snippet}"
    echo "probe-continued"
  )"
  probe_status=$?
  set -e
}

env_full="${workdir}/env.full"
env_minimal="${workdir}/env.minimal"
# 운영 .env.prod처럼 optional 키(CUSTOM__AI__SUMMARY__GEMINI__API_KEY)가 없는 상태를 재현한다.
{
  printf '%s\n' 'API_DOMAIN=api.example.com'
  printf '%s\n' 'ADMIN_EMBED_ORIGINS=https://admin.example.com'
  printf '%s\n' 'CUSTOM_PROD_BACKURL=https://api.example.com/path?a=b'
  printf '%s\n' 'CUSTOM__ADMIN__EMAIL=first@example.com'
  printf '%s\n' 'CUSTOM__ADMIN__EMAIL=last@example.com'
} > "${env_full}"
printf '%s\n' 'API_DOMAIN=api.example.com' > "${env_minimal}"

eval "$(extract_function env_value)"
eval "$(extract_function print_env_key_status)"

# shellcheck disable=SC2034  # 원본에서 떼어 온 env_value/print_env_key_status가 읽는 입력이다
ENV_FILE="${env_full}"

set +e
optional_value="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__API_KEY")"
optional_status=$?
set -e
if [ "${optional_status}" -ne 0 ]; then
  fail "expected a missing optional key to end with exit 0 instead of aborting the whole checkup (got ${optional_status})"
fi
if [ -n "${optional_value}" ]; then
  fail "expected a missing optional key to read as an empty value, got '${optional_value}'"
fi

if [ "$(env_value "API_DOMAIN")" != "api.example.com" ]; then
  fail "expected env_value to keep reading a present key"
fi
if [ "$(env_value "CUSTOM_PROD_BACKURL")" != "https://api.example.com/path?a=b" ]; then
  fail "expected env_value to keep everything after the first '=' of the value"
fi
if [ "$(env_value "CUSTOM__ADMIN__EMAIL")" != "last@example.com" ]; then
  fail "expected env_value to keep reading the last assignment of a duplicated key"
fi

if [ "$(print_env_key_status "ADMIN_EMBED_ORIGINS")" != "ADMIN_EMBED_ORIGINS=SET" ]; then
  fail "expected a present ADMIN_EMBED_ORIGINS to report SET"
fi
# shellcheck disable=SC2034  # 원본에서 떼어 온 print_env_key_status가 읽는 입력이다
ENV_FILE="${env_minimal}"
if [ "$(print_env_key_status "ADMIN_EMBED_ORIGINS")" != "ADMIN_EMBED_ORIGINS=MISSING" ]; then
  fail "expected an absent ADMIN_EMBED_ORIGINS to report MISSING"
fi

# ADMIN_EMBED_ORIGINS가 비면 Caddy가 frame-ancestors 허용목록 없이 CSP를 내려 관리자 UI의
# grafana/uptime-kuma iframe이 전부 차단되므로, 필수 키 점검이 이 키를 반드시 다뤄야 한다.
if ! grep -qF 'print_env_key_status "ADMIN_EMBED_ORIGINS"' "${doctor}"; then
  fail "expected ADMIN_EMBED_ORIGINS to be checked in the required env key section"
fi

headers_expired_first="${workdir}/headers-expired-first.txt"
headers_expired_last="${workdir}/headers-expired-last.txt"
headers_two_tokens="${workdir}/headers-two-tokens.txt"
headers_lowercase_name="${workdir}/headers-lowercase-name.txt"
headers_without_token="${workdir}/headers-without-token.txt"
# AuthCookieService.issueCookie()는 host-only 잔여 쿠키를 지우는 빈 값 쿠키를 실제 발급 쿠키보다
# 먼저 내보낸다. 첫 매치를 집으면 항상 빈 토큰을 읽는다.
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'Content-Type: application/json' \
  'Set-Cookie: accessToken=; Max-Age=0; Path=/; HttpOnly' \
  'Set-Cookie: refreshToken=; Max-Age=0; Path=/; HttpOnly' \
  'Set-Cookie: accessToken=header.payload.signature; Path=/; Domain=.example.com; HttpOnly; Secure' \
  'Set-Cookie: refreshToken=refresh.token.value; Path=/; HttpOnly' \
  '' > "${headers_expired_first}"
# 만료용 빈 쿠키가 마지막에 오는 순서. 값 있는 쿠키만 남기는 grep 필터가 없으면 마지막 줄을 집는
# 순간 빈 토큰이 되므로, 이 fixture가 `accessToken=[^;]` 필터를 단독으로 고정한다.
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'Content-Type: application/json' \
  'Set-Cookie: accessToken=header.payload.signature; Path=/; Domain=.example.com; HttpOnly; Secure' \
  'Set-Cookie: refreshToken=refresh.token.value; Path=/; HttpOnly' \
  'Set-Cookie: accessToken=; Max-Age=0; Path=/; HttpOnly' \
  '' > "${headers_expired_last}"
# 값 있는 accessToken이 둘인 응답. 마지막 쿠키가 최종 발급본이므로 첫 매치를 집으면 폐기된 토큰을
# 쓰게 된다. 이 fixture가 `tail -n 1` 선택을 단독으로 고정한다.
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'Content-Type: application/json' \
  'Set-Cookie: accessToken=first.payload.signature; Path=/; HttpOnly' \
  'Set-Cookie: accessToken=second.payload.signature; Path=/; HttpOnly' \
  '' > "${headers_two_tokens}"
# HTTP 헤더 이름은 대소문자를 구분하지 않는다. 프록시가 소문자로 정규화해 내려도 선택이 동작해야 한다.
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'content-type: application/json' \
  'set-cookie: accessToken=; Max-Age=0; Path=/; HttpOnly' \
  'set-cookie: accessToken=lowercase.payload.signature; Path=/; HttpOnly' \
  '' > "${headers_lowercase_name}"
printf '%s\r\n' \
  'HTTP/1.1 200 OK' \
  'Content-Type: application/json' \
  'Set-Cookie: refreshToken=refresh.token.value; Path=/; HttpOnly' \
  '' > "${headers_without_token}"

run_probe_snippet "${headers_expired_first}"
if [ "${probe_status}" -ne 0 ]; then
  fail "expected a login that issues a real accessToken to pass the probe (exit ${probe_status}): ${probe_output}"
fi
if [ "${probe_output}" != "probe-continued" ]; then
  fail "expected the probe to continue past the expired accessToken cookie, got '${probe_output}'"
fi

selected_token="$(select_access_token "${headers_expired_first}")"
if [ "${selected_token}" != "header.payload.signature" ]; then
  fail "expected the probe to skip the empty accessToken cookie and read the issued one, got '${selected_token}'"
fi
selected_token="$(select_access_token "${headers_expired_last}")"
if [ "${selected_token}" != "header.payload.signature" ]; then
  fail "expected the probe to skip a trailing empty accessToken cookie and read the issued one, got '${selected_token}'"
fi
selected_token="$(select_access_token "${headers_two_tokens}")"
if [ "${selected_token}" != "second.payload.signature" ]; then
  fail "expected the probe to read the last issued accessToken cookie, got '${selected_token}'"
fi
selected_token="$(select_access_token "${headers_lowercase_name}")"
if [ "${selected_token}" != "lowercase.payload.signature" ]; then
  fail "expected the probe to read a lowercased set-cookie header name, got '${selected_token}'"
fi

run_probe_snippet "${headers_expired_last}"
if [ "${probe_status}" -ne 0 ]; then
  fail "expected a trailing empty accessToken cookie not to be reported as a missing token (exit ${probe_status}): ${probe_output}"
fi

if [ -n "$(select_access_token "${headers_without_token}")" ]; then
  fail "expected a response without any accessToken cookie to read as an empty token"
fi

run_probe_snippet "${headers_without_token}"
if [ "${probe_status}" -ne 12 ]; then
  fail "expected a response without any accessToken cookie to keep failing with exit 12, got ${probe_status}"
fi
if [ "${probe_output}" != "login_access_token=missing" ]; then
  fail "expected a response without any accessToken cookie to report it as missing, got '${probe_output}'"
fi

eval "$(extract_function is_grafana_embed_url)"
eval "$(extract_function print_grafana_embed_status)"

grafana_embed_headers=""
inspect_grafana_internal_health() {
  printf '200'
}
inspect_grafana_embed_headers() {
  printf '%s' "${grafana_embed_headers}"
}

grafana_embed_headers="$(printf '%s\r\n' 'HTTP/1.1 200 OK' 'Content-Security-Policy: frame-ancestors ' '')"
empty_allowlist_output="$(print_grafana_embed_status "https://grafana.example.com/d/blog-overview/main")"
if [[ "${empty_allowlist_output}" != *"ADMIN_EMBED_ORIGINS is unset or empty"* ]]; then
  fail "expected an empty frame-ancestors source list to name ADMIN_EMBED_ORIGINS, got: ${empty_allowlist_output}"
fi
if [[ "${empty_allowlist_output}" == *"may omit admin origin allowlist"* ]]; then
  fail "expected an empty frame-ancestors source list not to be reported as a wrong allowlist value"
fi

grafana_embed_headers="$(printf '%s\r\n' 'HTTP/1.1 200 OK' 'Content-Security-Policy: frame-ancestors https://aquilaxk.site' '')"
allowlist_output="$(print_grafana_embed_status "https://grafana.example.com/d/blog-overview/main")"
if [[ "${allowlist_output}" != *"INFO: grafana embed CSP keeps frame-ancestors admin origin allowlist"* ]]; then
  fail "expected a populated frame-ancestors allowlist to stay reported as healthy, got: ${allowlist_output}"
fi

grafana_embed_headers="$(printf '%s\r\n' 'HTTP/1.1 200 OK' 'Content-Security-Policy: frame-ancestors https://other.example.com' '')"
wrong_allowlist_output="$(print_grafana_embed_status "https://grafana.example.com/d/blog-overview/main")"
if [[ "${wrong_allowlist_output}" != *"may omit admin origin allowlist"* ]]; then
  fail "expected a frame-ancestors allowlist without the admin origin to stay reported as a wrong value"
fi

echo "[test] homeserver doctor checkup rules passed"
