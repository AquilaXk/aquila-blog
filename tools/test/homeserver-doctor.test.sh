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

# doctor.sh는 set -u로 돌기 때문에 파일 어디에서도 대입되지 않는 대문자 변수를 참조하면 그 줄에서
# 점검 전체가 죽는다. Notification Snapshot Route가 미대입 ${API_DOMAIN}을 참조해 실제로 중단됐고,
# 그 abort가 프로덕션 드리프트를 가리고 있었다. 같은 실수 클래스를 정적으로 잡는다.
# ${VAR:-default}처럼 기본값이 붙은 형태는 set -u 대상이 아니므로 참조 수집에서 제외한다.
shell_provided_upper_names='BASH|BASH_ARGV0|BASH_COMMAND|BASH_REMATCH|BASH_SOURCE|BASH_VERSION'
shell_provided_upper_names="${shell_provided_upper_names}|EUID|FUNCNAME|GROUPS|HOME|HOSTNAME|IFS"
shell_provided_upper_names="${shell_provided_upper_names}|LANG|LC_ALL|LINENO|OLDPWD|OPTARG|OPTIND"
shell_provided_upper_names="${shell_provided_upper_names}|OSTYPE|PATH|PIPESTATUS|PPID|PS1|PS2|PS3|PS4"
shell_provided_upper_names="${shell_provided_upper_names}|PWD|RANDOM|REPLY|SECONDS|SHELL|SHLVL"
shell_provided_upper_names="${shell_provided_upper_names}|TERM|TMPDIR|TZ|UID|USER"

unassigned_upper_var_refs() {
  local script="$1"
  local refs="${workdir}/upper-var-refs.txt"
  local assigned="${workdir}/upper-var-assigned.txt"

  grep -oE '\$\{[A-Z_][A-Z0-9_]*\}' "${script}" | tr -d '${}' | sort -u > "${refs}" || true
  awk '
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/^(export|local|readonly)[[:space:]]+/, "", line)
      sub(/^declare[[:space:]]+-[a-zA-Z]+[[:space:]]+/, "", line)
      if (match(line, /^[A-Z_][A-Z0-9_]*=/)) {
        print substr(line, 1, RLENGTH - 1)
      } else if (match(line, /^for[[:space:]]+[A-Z_][A-Z0-9_]*[[:space:]]+in[[:space:]]/)) {
        split(line, parts, /[[:space:]]+/)
        print parts[2]
      }
    }
  ' "${script}" | sort -u > "${assigned}"

  comm -23 "${refs}" "${assigned}" | grep -Ev "^(${shell_provided_upper_names})$" || true
}

doctor_unassigned_refs="$(unassigned_upper_var_refs "${doctor}")"
if [ -n "${doctor_unassigned_refs}" ]; then
  fail "doctor.sh references uppercase variables that are never assigned in the file, so set -u aborts the whole checkup there: ${doctor_unassigned_refs}"
fi

# guard가 공허하지 않은지 확인한다. 미대입 참조 하나만 잡고 대입된 이름/기본값 형태/셸 제공
# 변수는 잡지 않아야 한다.
guard_fixture="${workdir}/unassigned-upper-ref.sh"
{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' 'set -euo pipefail'
  printf '%s\n' 'ASSIGNED_VALUE="ok"'
  printf '%s\n' 'echo "${ASSIGNED_VALUE}"'
  printf '%s\n' 'echo "${NEVER_ASSIGNED_VALUE}"'
  printf '%s\n' 'echo "${ALSO_NEVER_ASSIGNED:-default}"'
  printf '%s\n' 'echo "${HOME}"'
} > "${guard_fixture}"
guard_fixture_refs="$(unassigned_upper_var_refs "${guard_fixture}")"
if [ "${guard_fixture_refs}" != "NEVER_ASSIGNED_VALUE" ]; then
  fail "expected the unassigned uppercase reference guard to flag exactly NEVER_ASSIGNED_VALUE, got '${guard_fixture_refs}'"
fi

# .env.prod는 값에 따옴표를 붙여 적을 수 있다. host 추출과 URL 조립에 쓰는 값을 trim_quotes 없이
# 읽으면 Host 헤더가 -H 'Host: "api..."'가 되고 public URL도 https://"api..."/...로 조립돼, 라우트는
# 정상인데 점검만 상시 실패로 보고한다. 실패가 || true에 삼켜져 000/none으로만 보이므로 눈에
# 띄지도 않는다. Env AI Summary Sanity 값들은 표시와 공백검사에만 쓰여 따옴표가 결과를 바꾸지
# 않으므로 대상이 아니다.
host_url_env_keys="${workdir}/host-url-env-keys.txt"
{
  printf '%s\n' 'API_DOMAIN'
  printf '%s\n' 'CUSTOM_PROD_BACKURL'
  printf '%s\n' 'CUSTOM_PROD_COOKIEDOMAIN'
  printf '%s\n' 'CUSTOM_PROD_FRONTURL'
  printf '%s\n' 'GRAFANA_DOMAIN'
  printf '%s\n' 'NEXT_PUBLIC_GRAFANA_EMBED_URL'
  printf '%s\n' 'NEXT_PUBLIC_MONITORING_EMBED_URL'
} | sort -u > "${host_url_env_keys}"

# kind=trimmed면 trim_quotes로 감싼 조회의 키를, kind=raw면 감싸지 않은 조회의 키를 낸다.
# 감싼 조회를 먼저 줄에서 지우기 때문에 같은 줄에 두 형태가 섞여 있어도 구분된다.
env_value_keys() {
  local script="$1"
  local kind="$2"
  awk -v kind="${kind}" '
    {
      line = $0
      while (match(line, /trim_quotes "\$\(env_value "[A-Z_][A-Z0-9_]*"\)"/)) {
        chunk = substr(line, RSTART, RLENGTH)
        line = substr(line, 1, RSTART - 1) substr(line, RSTART + RLENGTH)
        if (kind == "trimmed") {
          match(chunk, /"[A-Z_][A-Z0-9_]*"\)/)
          print substr(chunk, RSTART + 1, RLENGTH - 3)
        }
      }
      while (match(line, /env_value "[A-Z_][A-Z0-9_]*"/)) {
        chunk = substr(line, RSTART, RLENGTH)
        line = substr(line, 1, RSTART - 1) substr(line, RSTART + RLENGTH)
        if (kind == "raw") {
          match(chunk, /"[A-Z_][A-Z0-9_]*"/)
          print substr(chunk, RSTART + 1, RLENGTH - 2)
        }
      }
    }
  ' "${script}" | sort -u
}

doctor_trimmed_env_keys="${workdir}/doctor-env-trimmed-keys.txt"
doctor_raw_env_keys="${workdir}/doctor-env-raw-keys.txt"
env_value_keys "${doctor}" trimmed > "${doctor_trimmed_env_keys}"
env_value_keys "${doctor}" raw > "${doctor_raw_env_keys}"

untrimmed_host_url_keys="$(comm -12 "${host_url_env_keys}" "${doctor_raw_env_keys}")"
if [ -n "${untrimmed_host_url_keys}" ]; then
  fail "doctor.sh reads these host/URL env keys without trim_quotes, so a quoted .env value breaks the Host header and the public URL there: ${untrimmed_host_url_keys}"
fi
# 키가 조회 자체를 잃으면 위 검사가 조용히 공허해지므로 여전히 읽고 있는지도 같이 못박는다.
unread_host_url_keys="$(comm -23 "${host_url_env_keys}" "${doctor_trimmed_env_keys}")"
if [ -n "${unread_host_url_keys}" ]; then
  fail "expected doctor.sh to keep reading these host/URL env keys through trim_quotes: ${unread_host_url_keys}"
fi
# 목록에 없는 키라도 같은 키를 어떤 곳은 감싸고 어떤 곳은 raw로 읽으면 그 한 곳만 조용히 깨진다.
mixed_env_keys="$(comm -12 "${doctor_trimmed_env_keys}" "${doctor_raw_env_keys}")"
if [ -n "${mixed_env_keys}" ]; then
  fail "doctor.sh reads these env keys through trim_quotes in some places and raw in others: ${mixed_env_keys}"
fi

# guard가 공허하지 않은지 확인한다. 감싸지 않은 host/URL 키만 잡고, 감싼 키와 표시 전용 키는
# 잡지 않아야 한다.
trim_quotes_guard_fixture="${workdir}/env-value-trim-quotes.sh"
{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' 'wrapped="$(trim_quotes "$(env_value "API_DOMAIN")")"'
  printf '%s\n' 'unwrapped="$(env_value "CUSTOM_PROD_FRONTURL")"'
  printf '%s\n' 'display_only="$(env_value "CUSTOM__AI__SUMMARY__GEMINI__MODEL")"'
} > "${trim_quotes_guard_fixture}"
trim_quotes_fixture_raw_keys="${workdir}/fixture-env-raw-keys.txt"
env_value_keys "${trim_quotes_guard_fixture}" raw > "${trim_quotes_fixture_raw_keys}"
trim_quotes_fixture_flagged="$(comm -12 "${host_url_env_keys}" "${trim_quotes_fixture_raw_keys}")"
if [ "${trim_quotes_fixture_flagged}" != "CUSTOM_PROD_FRONTURL" ]; then
  fail "expected the trim_quotes guard to flag exactly CUSTOM_PROD_FRONTURL, got '${trim_quotes_fixture_flagged}'"
fi

# print_robots_status는 origin/public 응답을 못 받아 헤더 파일이 없을 때도 계속 진행해야 한다.
# 헤더 파일이 없으면 awk가 exit 2로 끝나고, pipefail이 이를 대입 실패로 승격시키면 robots 섹션
# 이후 점검이 통째로 중단된다. 응답 부재는 아래 none 처리와 WARN이 이미 담당한다.
# 마커를 변수로 빼는 이유: `$(`가 든 리터럴을 명령 치환 안의 작은따옴표에 직접 적으면 bash 3.2가
# 괄호를 잘못 세어 실행 시점에 bad substitution으로 죽는다. 그때 이 파일은 성공 마커도 없이
# exit 0으로 끝나 검증이 통째로 공허해진다.
robots_code_marker='_code="$(awk '
robots_code_lines="$(
  awk -v marker="${robots_code_marker}" '
    index($0, marker) > 0 {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      print line
    }
  ' "${doctor}"
)"
robots_code_line_count="$(printf '%s\n' "${robots_code_lines}" | grep -cF "${robots_code_marker}" || true)"
if [ "${robots_code_line_count}" -ne 2 ]; then
  fail "expected print_robots_status to read both robots status codes with awk, found: ${robots_code_lines}"
fi

run_robots_status_code_extraction() {
  local headers_dir="$1"
  set +e
  robots_code_output="$(
    # abort 여부는 doctor.sh와 같은 셸 옵션에서만 드러난다. errexit/pipefail이 꺼져 있으면
    # 실패한 대입이 그냥 빈 값으로 넘어가 회귀를 놓친다.
    set -euo pipefail
    # shellcheck disable=SC2034  # 원본에서 떼어 온 추출 조각이 eval 시점에 읽는다
    origin_headers="${headers_dir}/robots-origin.headers"
    # shellcheck disable=SC2034  # 원본에서 떼어 온 추출 조각이 eval 시점에 읽는다
    public_headers="${headers_dir}/robots-public.headers"
    eval "${robots_code_lines}"
    # shellcheck disable=SC2154  # origin_code/public_code는 위 eval이 대입한다
    printf 'origin=[%s] public=[%s]' "${origin_code}" "${public_code}"
  )"
  robots_code_status=$?
  set -e
}

robots_headers_dir="${workdir}/robots-headers"
mkdir -p "${robots_headers_dir}"
printf '%s\r\n' 'HTTP/1.1 200 OK' 'Content-Type: text/plain' '' > "${robots_headers_dir}/robots-origin.headers"
printf '%s\r\n' 'HTTP/1.1 403 Forbidden' 'Content-Type: text/plain' '' > "${robots_headers_dir}/robots-public.headers"
run_robots_status_code_extraction "${robots_headers_dir}"
if [ "${robots_code_status}" -ne 0 ]; then
  fail "expected present robots header files to read cleanly (exit ${robots_code_status}): ${robots_code_output}"
fi
if [ "${robots_code_output}" != "origin=[200] public=[403]" ]; then
  fail "expected the robots status codes to come from the response headers, got '${robots_code_output}'"
fi

run_robots_status_code_extraction "${workdir}/robots-headers-missing"
if [ "${robots_code_status}" -ne 0 ]; then
  fail "expected absent robots header files to keep the checkup running instead of aborting it (exit ${robots_code_status})"
fi
if [ "${robots_code_output}" != "origin=[] public=[]" ]; then
  fail "expected absent robots header files to read as empty status codes, got '${robots_code_output}'"
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

# 허용목록 판정은 frame-ancestors 소스 목록만 봐야 한다. 헤더 전체를 보면 default-src 같은 다른
# 지시어의 와일드카드가 관리자 origin이 허용된 것처럼 보이게 만들어 차단 상태를 정상으로 보고한다.
grafana_embed_headers="$(printf '%s\r\n' 'HTTP/1.1 200 OK' "Content-Security-Policy: default-src 'self' *; frame-ancestors https://evil.example.com" '')"
other_directive_wildcard_output="$(print_grafana_embed_status "https://grafana.example.com/d/blog-overview/main")"
if [[ "${other_directive_wildcard_output}" != *"may omit admin origin allowlist"* ]]; then
  fail "expected a wildcard in another CSP directive not to pass the frame-ancestors allowlist check, got: ${other_directive_wildcard_output}"
fi
if [[ "${other_directive_wildcard_output}" == *"keeps frame-ancestors admin origin allowlist"* ]]; then
  fail "expected a frame-ancestors allowlist without the admin origin not to be reported as healthy, got: ${other_directive_wildcard_output}"
fi

echo "[test] homeserver doctor checkup rules passed"
