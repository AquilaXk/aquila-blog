#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

deploy_script="deploy/homeserver/blue_green_deploy.sh"
rollback_script="deploy/homeserver/rollback_last_deploy.sh"
probe_script="deploy/homeserver/caddy_upstream_probe.sh"
caddy_source="deploy/homeserver/caddy/Caddyfile"

for required in "${deploy_script}" "${rollback_script}" "${probe_script}" "${caddy_source}"; do
  if [ ! -f "${required}" ]; then
    echo "[test] ${required} is missing from the repository checkout" >&2
    exit 1
  fi
done

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

fail() {
  echo "[test] $1" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 하네스 무결성 가드
#
# 두 배포 스크립트는 docker와 홈서버 없이 통째로 실행할 수 없다. 그래서 검사 대상 함수만 원본
# 파일에서 떼어내 fixture 위에서 평가한다. 사본을 테스트에 적어 두면 원본이 회귀해도 통과하므로
# 항상 파일에서 읽는다.
#
# 이 방식의 함정: 추출 목록에 빠진 함수를 하네스가 호출하면 그 호출은 command not found로
# 죽고(status 127), 호출이 `if ...` 조건 안에 있으면 조건이 false로 흘러 테스트가 조용히
# 통과한다. 실제로 caddy_file_has_literal_colour_upstream이 목록에서 빠져 split 분기의 리터럴
# 드리프트 경고 경로가 전혀 검증되지 않은 채 그린이었다. 그래서 하네스는 실행 전(정적 closure
# 검사)과 실행 후(command not found 검사) 두 번 막는다.
# ---------------------------------------------------------------------------

production_functions="${workdir}/production-functions"
grep -hoE '^[A-Za-z_][A-Za-z0-9_]*\(\)' \
  "${deploy_script}" "${rollback_script}" "${probe_script}" \
  | sed 's/()$//' | sort -u > "${production_functions}"
if [ ! -s "${production_functions}" ]; then
  fail "cannot enumerate production function names; the closure guard would pass vacuously"
fi

# 하네스가 호출하는 프로덕션 함수 중 하네스 안에 정의(추출 또는 스텁)되지 않은 이름.
harness_missing_functions() {
  local harness="$1"
  local words="${workdir}/harness-words"
  local defined="${workdir}/harness-defined"

  # 주석 줄은 지운다: 주석에 적힌 함수 이름은 호출이 아니다.
  sed 's/^[[:space:]]*#.*$//' "${harness}" \
    | grep -oE '[A-Za-z_][A-Za-z0-9_]*' | sort -u > "${words}"
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*\(\)' "${harness}" \
    | sed 's/()$//' | sort -u > "${defined}"

  comm -12 "${production_functions}" "${words}" | comm -23 - "${defined}" | tr '\n' ' '
}

# bash가 함수를 못 찾으면 stderr에 "command not found"를 남기고 127로 끝난다. 메시지가 로케일에
# 따라 번역되면 이 검사가 무력화되므로 하네스는 항상 LC_ALL=C로 실행한다.
stderr_has_missing_command() {
  grep -qE 'command not found|: not found' "$1"
}

harness_stdout="${workdir}/harness-stdout"
harness_stderr="${workdir}/harness-stderr"
harness_status=0

# 모든 하네스 실행은 이 함수를 지난다.
run_harness() {
  local harness="$1"
  shift

  local missing
  missing="$(harness_missing_functions "${harness}")"
  if [ -n "${missing# }" ]; then
    fail "harness $(basename "${harness}") calls production functions it never extracted or stubbed: ${missing}"
  fi

  harness_status=0
  LC_ALL=C LANG=C bash "${harness}" "$@" >"${harness_stdout}" 2>"${harness_stderr}" || harness_status=$?
  if stderr_has_missing_command "${harness_stderr}"; then
    echo "[test] harness $(basename "${harness}") hit an undefined command:" >&2
    cat "${harness_stderr}" >&2
    exit 1
  fi
}

extract_function() {
  local script="$1"
  local name="$2"
  local body
  body="$(
    awk -v head="${name}() {" '
      index($0, head) == 1 { capture = 1 }
      capture { print }
      capture && $0 == "}" { exit }
    ' "${script}"
  )"
  if [ -z "${body}" ]; then
    fail "cannot extract ${name}() from ${script}"
  fi
  printf '%s\n' "${body}"
}

# 가드 self-check: 함수 하나를 일부러 빼먹은 하네스에 두 장치가 모두 반응해야 한다. 이 검사가
# 없으면 가드가 조용히 무력화되어도 아무도 모른다.
selfcheck_harness="${workdir}/selfcheck-harness.sh"
{
  printf '%s\n' 'set -uo pipefail'
  printf '%s\n' 'if caddy_file_has_literal_colour_upstream; then :; fi'
  printf '%s\n' 'printf "selfcheck done\n"'
} > "${selfcheck_harness}"
if [ -z "$(harness_missing_functions "${selfcheck_harness}")" ]; then
  fail "closure guard no longer reports a production function the harness never defined"
fi
if ! LC_ALL=C LANG=C bash "${selfcheck_harness}" >/dev/null 2>"${workdir}/selfcheck-stderr"; then
  fail "selfcheck harness must survive the missing call so the stderr guard is what catches it"
fi
if ! stderr_has_missing_command "${workdir}/selfcheck-stderr"; then
  fail "stderr guard no longer reports a command-not-found harness"
fi

# ---------------------------------------------------------------------------
# fixture
# ---------------------------------------------------------------------------

write_split_env() {
  {
    printf '%s\n' 'API_DOMAIN=api.example.com'
    printf '%s\n' 'RUNTIME_SPLIT_ENABLED=true'
    printf '%s\n' 'READ_API_UPSTREAM=back_read'
    printf '%s\n' 'ADMIN_API_UPSTREAM=back_admin'
  } > "$1"
}

write_single_env() {
  {
    printf '%s\n' 'API_DOMAIN=api.example.com'
    printf '%s\n' 'RUNTIME_SPLIT_ENABLED=false'
    printf '%s\n' 'READ_API_UPSTREAM=back_blue'
    printf '%s\n' 'ADMIN_API_UPSTREAM=back_blue'
  } > "$1"
}

# ADMIN_API_UPSTREAM이 없는 split env. placeholder 기본값 fallback과 기대값 fail-fast를 본다.
write_split_env_without_admin() {
  {
    printf '%s\n' 'API_DOMAIN=api.example.com'
    printf '%s\n' 'RUNTIME_SPLIT_ENABLED=true'
    printf '%s\n' 'READ_API_UPSTREAM=back_read'
  } > "$1"
}

# 모든 upstream이 색 리터럴로 덮인 Caddyfile. #1418 이전 cutover가 남기던 상태다.
write_full_drift_caddyfile() {
  sed -E \
    -e 's/\{\$ADMIN_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/back_green:8080/g' \
    -e 's/\{\$READ_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/back_green:8080/g' \
    "${caddy_source}" > "$1"
}

# forward_auth 한 줄만 리터럴로 덮인 Caddyfile. reverse_proxy 첫 토큰은 placeholder로 남으므로
# 단일 토큰 route 검증은 이 드리프트를 보지 못한다 — 경고 경로만 잡을 수 있다.
write_partial_drift_caddyfile() {
  sed -E \
    -e 's/^([[:space:]]*forward_auth[[:space:]]+)\{\$ADMIN_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/\1back_blue:8080/' \
    "${caddy_source}" > "$1"
}

count_matches() {
  local count
  count="$(grep -oF "$2" "$1" | wc -l || true)"
  printf '%s' "${count//[[:space:]]/}"
}

# count_matches는 라인 수가 아니라 토큰 수를 세야 한다. Caddy는 `reverse_proxy a:8080 b:8080`
# 형태를 허용하고 cutover의 sed도 그 쌍을 치환 대상으로 다루므로, 라인 수를 세면 치환 개수
# 검증이 조용히 어긋난다.
counter_fixture="${workdir}/counter-fixture"
{
  printf '%s\n' 'reverse_proxy back_blue:8080 back_blue:8080'
  printf '%s\n' 'reverse_proxy back_blue:8080'
} > "${counter_fixture}"
if [ "$(count_matches "${counter_fixture}" 'back_blue:8080')" -ne 3 ]; then
  fail "count_matches must count occurrences, not matching lines"
fi

# ---------------------------------------------------------------------------
# 커밋된 Caddyfile 계약
#
# 저장소에 커밋된 Caddyfile은 색 리터럴이 아니라 placeholder 형태여야 한다. 리터럴이 커밋되면
# runtime-split은 env 값과 무관하게 단일 컨테이너로 붕괴한다.
# ---------------------------------------------------------------------------

if grep -Eq 'back[-_](blue|green|active):8080' "${caddy_source}"; then
  fail "${caddy_source} must reference backends through {\$READ_API_UPSTREAM}/{\$ADMIN_API_UPSTREAM} placeholders, not literal colour hosts"
fi
if [ "$(count_matches "${caddy_source}" '{$ADMIN_API_UPSTREAM:')" -lt 1 ]; then
  fail "${caddy_source} lost the ADMIN_API_UPSTREAM placeholder"
fi
if [ "$(count_matches "${caddy_source}" '{$READ_API_UPSTREAM:')" -lt 1 ]; then
  fail "${caddy_source} lost the READ_API_UPSTREAM placeholder"
fi

placeholder_count="$(( $(count_matches "${caddy_source}" '{$ADMIN_API_UPSTREAM:') + $(count_matches "${caddy_source}" '{$READ_API_UPSTREAM:') ))"

# 부분 드리프트 fixture가 실제로 forward_auth 한 줄만 바꾸는지 확인한다. Caddyfile 구조가 바뀌어
# 이 sed가 아무것도 못 바꾸면 아래 경고 경로 검사가 공허해진다.
partial_probe="${workdir}/partial-probe-caddyfile"
write_partial_drift_caddyfile "${partial_probe}"
if [ "$(count_matches "${partial_probe}" '{$ADMIN_API_UPSTREAM:')" -ne "$(( $(count_matches "${caddy_source}" '{$ADMIN_API_UPSTREAM:') - 1 ))" ]; then
  fail "partial drift fixture must pin exactly one forward_auth upstream to a literal colour"
fi

# ---------------------------------------------------------------------------
# set_caddy_upstream_backend() 계약
#
# reload_caddy는 컨테이너를 요구하므로 marker 파일로 대체해 호출 여부만 관찰한다.
# ---------------------------------------------------------------------------

run_set_caddy_upstream_backend() {
  local script="$1"
  local split="$2"
  local backend="$3"
  local caddy_file="$4"
  local env_file="$5"
  local reload_marker="$6"
  local harness="${workdir}/set-upstream-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'CADDY_FILE=%q\n' "${caddy_file}"
    printf 'ENV_FILE=%q\n' "${env_file}"
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    printf 'RELOAD_MARKER=%q\n' "${reload_marker}"
    printf '%s\n' 'reload_caddy() { printf "reload\n" >> "${RELOAD_MARKER}"; }'
    extract_function "${script}" env_value
    extract_function "${script}" trim_quotes
    extract_function "${script}" upsert_env_key
    extract_function "${script}" normalize_backend_name
    extract_function "${script}" host_env_value
    extract_function "${script}" backend_http_host
    extract_function "${script}" caddy_file_has_literal_colour_upstream
    extract_function "${script}" set_caddy_upstream_backend
    printf '%s\n' 'set_caddy_upstream_backend "$1"'
  } > "${harness}"

  run_harness "${harness}" "${backend}"
}

for script in "${deploy_script}" "${rollback_script}"; do
  label="$(basename "${script}")"

  # runtime-split: cutover는 placeholder도 upstream env 키도 건드리면 안 된다.
  split_caddy="${workdir}/split-caddyfile"
  split_env="${workdir}/split-env"
  split_env_expected="${workdir}/split-env-expected"
  split_reload="${workdir}/split-reload"
  cp "${caddy_source}" "${split_caddy}"
  write_split_env "${split_env}"
  write_split_env "${split_env_expected}"
  rm -f "${split_reload}"

  run_set_caddy_upstream_backend "${script}" "true" "back_green" \
    "${split_caddy}" "${split_env}" "${split_reload}"
  if [ "${harness_status}" -ne 0 ]; then
    cat "${harness_stderr}" >&2
    fail "${label}: runtime-split cutover exited ${harness_status}"
  fi

  if ! cmp -s "${caddy_source}" "${split_caddy}"; then
    echo "[test] ${label}: runtime-split cutover rewrote the Caddyfile" >&2
    diff -u "${caddy_source}" "${split_caddy}" >&2 || true
    exit 1
  fi
  if ! cmp -s "${split_env_expected}" "${split_env}"; then
    echo "[test] ${label}: runtime-split cutover overwrote upstream env keys" >&2
    diff -u "${split_env_expected}" "${split_env}" >&2 || true
    exit 1
  fi
  if [ ! -s "${split_reload}" ]; then
    fail "${label}: runtime-split cutover must still reload caddy so the restored config reaches the running process"
  fi
  if ! grep -q 'kept on runtime-split placeholders' "${harness_stdout}"; then
    fail "${label}: runtime-split cutover must report that the placeholders were kept"
  fi
  if grep -q 'WARN' "${harness_stderr}"; then
    cat "${harness_stderr}" >&2
    fail "${label}: runtime-split cutover must not warn about a placeholder-only Caddyfile"
  fi

  # runtime-split + 리터럴 드리프트: cutover는 파일을 고치지 않지만, env 라우팅이 무력화된
  # 줄을 실측 로그로 남겨야 한다. 부분 드리프트는 route 검증이 못 보는 경로다.
  drift_caddy="${workdir}/split-drift-caddyfile"
  drift_caddy_expected="${workdir}/split-drift-caddyfile-expected"
  drift_env="${workdir}/split-drift-env"
  drift_env_expected="${workdir}/split-drift-env-expected"
  drift_reload="${workdir}/split-drift-reload"
  write_partial_drift_caddyfile "${drift_caddy}"
  write_partial_drift_caddyfile "${drift_caddy_expected}"
  write_split_env "${drift_env}"
  write_split_env "${drift_env_expected}"
  rm -f "${drift_reload}"

  run_set_caddy_upstream_backend "${script}" "true" "back_green" \
    "${drift_caddy}" "${drift_env}" "${drift_reload}"
  if [ "${harness_status}" -ne 0 ]; then
    cat "${harness_stderr}" >&2
    fail "${label}: runtime-split cutover on a drifted Caddyfile exited ${harness_status}"
  fi
  if ! cmp -s "${drift_caddy_expected}" "${drift_caddy}"; then
    echo "[test] ${label}: runtime-split cutover rewrote the drifted Caddyfile" >&2
    diff -u "${drift_caddy_expected}" "${drift_caddy}" >&2 || true
    exit 1
  fi
  if ! cmp -s "${drift_env_expected}" "${drift_env}"; then
    fail "${label}: runtime-split cutover overwrote upstream env keys on a drifted Caddyfile"
  fi
  if [ ! -s "${drift_reload}" ]; then
    fail "${label}: runtime-split cutover must reload caddy even when the restored config drifted"
  fi
  if ! grep -q 'WARN' "${harness_stderr}" || ! grep -q 'literal colour' "${harness_stderr}"; then
    cat "${harness_stderr}" >&2
    fail "${label}: runtime-split cutover must warn that literal colour upstreams defeat env routing"
  fi
  if ! grep -qE '^[0-9]+:[[:space:]]*(reverse_proxy|forward_auth)[[:space:]]+back_blue:8080' "${harness_stderr}"; then
    cat "${harness_stderr}" >&2
    fail "${label}: runtime-split cutover must log the drifted upstream lines it found"
  fi
  if grep -q 'kept on runtime-split placeholders' "${harness_stdout}"; then
    fail "${label}: runtime-split cutover must not report a healthy placeholder edge while literals are present"
  fi

  # 단일 런타임: 기존 동작 그대로 활성 색 리터럴로 치환하고 env 키도 갱신한다.
  single_caddy="${workdir}/single-caddyfile"
  single_env="${workdir}/single-env"
  single_reload="${workdir}/single-reload"
  cp "${caddy_source}" "${single_caddy}"
  write_single_env "${single_env}"
  rm -f "${single_reload}"

  run_set_caddy_upstream_backend "${script}" "false" "back_green" \
    "${single_caddy}" "${single_env}" "${single_reload}"
  if [ "${harness_status}" -ne 0 ]; then
    cat "${harness_stderr}" >&2
    fail "${label}: single-runtime cutover exited ${harness_status}"
  fi

  if cmp -s "${caddy_source}" "${single_caddy}"; then
    fail "${label}: single-runtime cutover must pin the active colour into the Caddyfile"
  fi
  if grep -q '{$ADMIN_API_UPSTREAM:' "${single_caddy}" || grep -q '{$READ_API_UPSTREAM:' "${single_caddy}"; then
    fail "${label}: single-runtime cutover must replace every upstream placeholder"
  fi
  literal_count="$(count_matches "${single_caddy}" 'back_green:8080')"
  if [ "${literal_count}" -ne "${placeholder_count}" ]; then
    fail "${label}: single-runtime cutover rewrote ${literal_count} upstreams but the Caddyfile has ${placeholder_count} placeholders"
  fi
  if ! grep -qx 'ADMIN_API_UPSTREAM=back_green' "${single_env}"; then
    fail "${label}: single-runtime cutover must pin ADMIN_API_UPSTREAM to the active colour"
  fi
  if ! grep -qx 'READ_API_UPSTREAM=back_green' "${single_env}"; then
    fail "${label}: single-runtime cutover must pin READ_API_UPSTREAM to the active colour"
  fi
  if [ ! -s "${single_reload}" ]; then
    fail "${label}: single-runtime cutover must reload caddy"
  fi
done

# ---------------------------------------------------------------------------
# upstream 기대값/실측값
# ---------------------------------------------------------------------------

run_upstream_expectation() {
  local split="$1"
  local backend="$2"
  local caddy_file="$3"
  local env_file="$4"
  local harness="${workdir}/expectation-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'CADDY_FILE=%q\n' "${caddy_file}"
    printf 'ENV_FILE=%q\n' "${env_file}"
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    printf '%s\n' 'mounted_env_value() { return 1; }'
    extract_function "${deploy_script}" env_value
    extract_function "${deploy_script}" trim_quotes
    extract_function "${deploy_script}" normalize_backend_name
    extract_function "${deploy_script}" host_env_value
    extract_function "${deploy_script}" backend_http_host
    extract_function "${deploy_script}" resolve_caddy_upstream_token
    extract_function "${deploy_script}" current_caddy_upstream_host
    extract_function "${deploy_script}" expected_caddy_upstream_host
    printf '%s\n' 'printf "expected=%s current=%s\n" "$(expected_caddy_upstream_host "$1")" "$(current_caddy_upstream_host)"'
  } > "${harness}"

  run_harness "${harness}" "${backend}"
  cat "${harness_stdout}"
}

# runtime-split에서 verify_caddy_route()는 색이 아니라 ADMIN_API_UPSTREAM을 기대해야 한다.
expect_caddy="${workdir}/expect-caddyfile"
expect_env="${workdir}/expect-env"
cp "${caddy_source}" "${expect_caddy}"
write_split_env "${expect_env}"
result="$(run_upstream_expectation "true" "back_green" "${expect_caddy}" "${expect_env}")"
if [ "${result}" != "expected=back_admin current=back_admin" ]; then
  fail "runtime-split route verification must expect the split upstream, got: ${result}"
fi

# 같은 검증이 리터럴 드리프트를 잡아야 한다: Caddyfile이 색으로 덮이면 기대값과 어긋난다.
full_drift_caddy="${workdir}/full-drift-caddyfile"
write_full_drift_caddyfile "${full_drift_caddy}"
result="$(run_upstream_expectation "true" "back_green" "${full_drift_caddy}" "${expect_env}")"
if [ "${result}" != "expected=back_admin current=back_green" ]; then
  fail "runtime-split route verification must reject a colour-pinned Caddyfile, got: ${result}"
fi

# 부분 드리프트는 단일 토큰 검증에 걸리지 않는다. 그래서 cutover의 경고 로그가 유일한 신호이며,
# 위 경고 경로 검사가 이 사실 때문에 필요하다.
partial_drift_caddy="${workdir}/partial-drift-caddyfile"
write_partial_drift_caddyfile "${partial_drift_caddy}"
result="$(run_upstream_expectation "true" "back_green" "${partial_drift_caddy}" "${expect_env}")"
if [ "${result}" != "expected=back_admin current=back_admin" ]; then
  fail "partial drift must stay invisible to single-token route verification, got: ${result}"
fi

# 단일 런타임에서는 기존대로 활성 색을 기대한다.
single_expect_env="${workdir}/single-expect-env"
write_single_env "${single_expect_env}"
result="$(run_upstream_expectation "false" "back_green" "${full_drift_caddy}" "${single_expect_env}")"
if [ "${result}" != "expected=back_green current=back_green" ]; then
  fail "single-runtime route verification must expect the active colour, got: ${result}"
fi

# ---------------------------------------------------------------------------
# verify_caddy_route() 배선
#
# 기대값/실측값 함수만 직접 부르면 verify_caddy_route()가 그 값을 실제로 쓰는지는 고정되지
# 않는다(호출부를 backend_http_host로 되돌려도 그린). 그래서 verify_caddy_route()를 그대로
# 실행한다. HTTP 프로브는 200 고정이므로 판정은 upstream 비교에서만 갈린다.
# ---------------------------------------------------------------------------

run_verify_caddy_route() {
  local split="$1"
  local backend="$2"
  local caddy_file="$3"
  local env_file="$4"
  local harness="${workdir}/verify-route-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'CADDY_FILE=%q\n' "${caddy_file}"
    printf 'ENV_FILE=%q\n' "${env_file}"
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    printf '%s\n' 'sleep() { :; }'
    printf '%s\n' 'mounted_env_value() { return 1; }'
    printf '%s\n' 'run_compose_diagnostic() { return 0; }'
    printf '%s\n' 'probe_caddy_http_code() { printf "200"; }'
    extract_function "${deploy_script}" env_value
    extract_function "${deploy_script}" trim_quotes
    extract_function "${deploy_script}" normalize_backend_name
    extract_function "${deploy_script}" host_env_value
    extract_function "${deploy_script}" backend_http_host
    extract_function "${deploy_script}" resolve_caddy_upstream_token
    extract_function "${deploy_script}" current_caddy_upstream_host
    extract_function "${deploy_script}" expected_caddy_upstream_host
    extract_function "${deploy_script}" is_healthy_http_code
    extract_function "${deploy_script}" verify_caddy_route
    printf '%s\n' 'verify_caddy_route "$1" api.example.com'
  } > "${harness}"

  run_harness "${harness}" "${backend}"
}

run_verify_caddy_route "true" "back_green" "${expect_caddy}" "${expect_env}"
if [ "${harness_status}" -ne 0 ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "verify_caddy_route must accept a placeholder Caddyfile under runtime-split (it must not expect the cutover colour)"
fi

run_verify_caddy_route "true" "back_green" "${full_drift_caddy}" "${expect_env}"
if [ "${harness_status}" -eq 0 ]; then
  fail "verify_caddy_route must reject a colour-pinned Caddyfile under runtime-split"
fi
if ! grep -q 'caddy upstream pending' "${harness_stdout}"; then
  fail "verify_caddy_route must report the upstream mismatch it waited on"
fi

split_env_no_admin="${workdir}/split-env-no-admin"
write_split_env_without_admin "${split_env_no_admin}"
run_verify_caddy_route "true" "back_green" "${expect_caddy}" "${split_env_no_admin}"
if [ "${harness_status}" -eq 0 ]; then
  fail "verify_caddy_route must fail fast when runtime-split leaves ADMIN_API_UPSTREAM unset"
fi
if ! grep -q 'ADMIN_API_UPSTREAM' "${harness_stderr}"; then
  fail "verify_caddy_route must name the missing upstream key when the expectation is unresolvable"
fi

run_verify_caddy_route "false" "back_green" "${full_drift_caddy}" "${single_expect_env}"
if [ "${harness_status}" -ne 0 ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "verify_caddy_route must accept the pinned active colour in single-runtime mode"
fi

# ---------------------------------------------------------------------------
# caddy_upstream_probe.sh 계약
#
# deploy.yml post-deploy 게이트와 check_deploy_status.sh가 쓰는 단일 구현이다. 리터럴 색만
# 매칭하던 예전 awk는 placeholder Caddyfile에서 빈 문자열을 돌려주고 정상 split 상태를 영구
# mismatch로 신고했다.
# ---------------------------------------------------------------------------

probe_stdout="${workdir}/probe-stdout"
probe_stderr="${workdir}/probe-stderr"
probe_status=0

run_probe() {
  local caddy_file="$1"
  local env_file="$2"
  shift 2

  probe_status=0
  env -u RUNTIME_SPLIT_ENABLED LC_ALL=C LANG=C \
    CADDY_FILE="${caddy_file}" ENV_FILE="${env_file}" \
    bash "${probe_script}" "$@" >"${probe_stdout}" 2>"${probe_stderr}" || probe_status=$?
  if stderr_has_missing_command "${probe_stderr}"; then
    cat "${probe_stderr}" >&2
    fail "caddy_upstream_probe.sh hit an undefined command"
  fi
}

expect_probe_output() {
  local expected="$1"
  local context="$2"
  local actual
  actual="$(cat "${probe_stdout}")"
  if [ "${probe_status}" -ne 0 ]; then
    cat "${probe_stderr}" >&2
    fail "caddy_upstream_probe.sh ${context} exited ${probe_status}"
  fi
  if [ "${actual}" != "${expected}" ]; then
    fail "caddy_upstream_probe.sh ${context} must print ${expected}, got: ${actual:-empty}"
  fi
}

run_probe "${expect_caddy}" "${expect_env}" host
expect_probe_output "back_admin" "host on a placeholder Caddyfile"

run_probe "${full_drift_caddy}" "${expect_env}" host
expect_probe_output "back_green" "host on a colour-pinned Caddyfile"

run_probe "${expect_caddy}" "${split_env_no_admin}" host
expect_probe_output "back_blue" "host with an unset upstream key (placeholder default)"

run_probe "${expect_caddy}" "${expect_env}" expected back_green
expect_probe_output "back_admin" "expected under runtime-split"

run_probe "${full_drift_caddy}" "${single_expect_env}" expected back_green
expect_probe_output "back_green" "expected in single-runtime mode"

run_probe "${expect_caddy}" "${split_env_no_admin}" expected back_green
if [ "${probe_status}" -eq 0 ]; then
  fail "caddy_upstream_probe.sh expected must fail when runtime-split leaves ADMIN_API_UPSTREAM unset"
fi
if ! grep -q 'ADMIN_API_UPSTREAM' "${probe_stderr}"; then
  fail "caddy_upstream_probe.sh must name the missing upstream key"
fi

run_probe "${expect_caddy}" "${single_expect_env}" expected back_read
if [ "${probe_status}" -eq 0 ]; then
  fail "caddy_upstream_probe.sh expected must reject a non-colour backend in single-runtime mode"
fi

# mounted 모드는 caddy 컨테이너 안에서 해석하므로 docker를 stub한다. stub 없이는 이 경로가 CI에서
# 전혀 실행되지 않는다. mounted 값은 호스트 .env가 아니라 컨테이너 env를 따라야 한다.
docker_stub_dir="${workdir}/stub-bin"
mkdir -p "${docker_stub_dir}"
cat > "${docker_stub_dir}/docker" <<'DOCKER_STUB'
#!/usr/bin/env bash
# `docker compose ... exec -T caddy <cmd...>` 만 처리한다.
set -uo pipefail
args=("$@")
idx=0
while [ "${idx}" -lt "${#args[@]}" ]; do
  if [ "${args[${idx}]}" = "caddy" ]; then
    break
  fi
  idx=$((idx + 1))
done
if [ "${idx}" -ge "${#args[@]}" ]; then
  echo "docker stub: unsupported invocation: $*" >&2
  exit 97
fi
cmd=("${args[@]:$((idx + 1))}")
if [ "${#cmd[@]}" -eq 3 ] && [ "${cmd[0]}" = "sh" ] && [ "${cmd[1]}" = "-lc" ]; then
  awk -F= -v key="${cmd[2]#printenv }" '$1 == key {print substr($0, index($0, "=") + 1); exit}' \
    "${STUB_MOUNTED_ENV}"
  exit 0
fi
if [ "${#cmd[@]}" -eq 3 ] && [ "${cmd[0]}" = "awk" ]; then
  exec awk "${cmd[1]}" "${STUB_MOUNTED_CADDY}"
fi
echo "docker stub: unsupported container command: ${cmd[*]}" >&2
exit 97
DOCKER_STUB
chmod +x "${docker_stub_dir}/docker"

mounted_env="${workdir}/mounted-env"
{
  printf '%s\n' 'READ_API_UPSTREAM=back_read'
  printf '%s\n' 'ADMIN_API_UPSTREAM=back_admin'
} > "${mounted_env}"

run_probe_mounted() {
  local caddy_file="$1"
  local host_env_file="$2"
  local mounted_env_file="$3"

  probe_status=0
  env -u RUNTIME_SPLIT_ENABLED LC_ALL=C LANG=C \
    PATH="${docker_stub_dir}:${PATH}" \
    STUB_MOUNTED_CADDY="${caddy_file}" STUB_MOUNTED_ENV="${mounted_env_file}" \
    CADDY_FILE="${caddy_file}" ENV_FILE="${host_env_file}" \
    bash "${probe_script}" mounted >"${probe_stdout}" 2>"${probe_stderr}" || probe_status=$?
  if stderr_has_missing_command "${probe_stderr}"; then
    cat "${probe_stderr}" >&2
    fail "caddy_upstream_probe.sh mounted hit an undefined command"
  fi
}

# 호스트 .env는 ADMIN_API_UPSTREAM을 모르지만 컨테이너 env는 알고 있다 -> 컨테이너 값이 나와야
# 한다. 호스트 값으로 해석하면 placeholder 기본값(back_blue)이 나온다.
run_probe_mounted "${expect_caddy}" "${split_env_no_admin}" "${mounted_env}"
expect_probe_output "back_admin" "mounted on a placeholder Caddyfile"

run_probe_mounted "${full_drift_caddy}" "${expect_env}" "${mounted_env}"
expect_probe_output "back_green" "mounted on a colour-pinned Caddyfile"

# ---------------------------------------------------------------------------
# rollback legacy 정규화는 runtime-split에서 실행되지 않아야 한다
#
# 정규화는 모든 리터럴 upstream을 하드코딩 back_blue로 고정한다. split 분기는 그 뒤로 파일을
# 다시 쓰지 않으므로, back_green으로 뜬 backup을 복원하면 edge가 곧 정지될 컨테이너를 가리킨다.
# ---------------------------------------------------------------------------

extract_legacy_normalization_block() {
  local block
  block="$(
    awk '
      index($0, "if [[ -f \"${CADDY_FILE}\"") == 1 { capture = 1 }
      capture { print }
      capture && $0 == "fi" { exit }
    ' "${rollback_script}"
  )"
  if [ -z "${block}" ] || ! printf '%s' "${block}" | grep -q 'normalized='; then
    fail "cannot extract the legacy upstream normalization block from ${rollback_script}"
  fi
  printf '%s\n' "${block}"
}

run_legacy_normalization() {
  local split="$1"
  local caddy_file="$2"
  local harness="${workdir}/legacy-normalization-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'CADDY_FILE=%q\n' "${caddy_file}"
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    extract_legacy_normalization_block
  } > "${harness}"

  run_harness "${harness}"
}

legacy_split_caddy="${workdir}/legacy-split-caddyfile"
legacy_split_expected="${workdir}/legacy-split-caddyfile-expected"
write_full_drift_caddyfile "${legacy_split_caddy}"
write_full_drift_caddyfile "${legacy_split_expected}"
run_legacy_normalization "true" "${legacy_split_caddy}"
if [ "${harness_status}" -ne 0 ]; then
  cat "${harness_stderr}" >&2
  fail "legacy normalization block exited ${harness_status} under runtime-split"
fi
if ! cmp -s "${legacy_split_expected}" "${legacy_split_caddy}"; then
  echo "[test] runtime-split rollback must not normalize restored upstream tokens to back_blue" >&2
  diff -u "${legacy_split_expected}" "${legacy_split_caddy}" >&2 || true
  exit 1
fi

legacy_single_caddy="${workdir}/legacy-single-caddyfile"
write_full_drift_caddyfile "${legacy_single_caddy}"
run_legacy_normalization "false" "${legacy_single_caddy}"
if [ "${harness_status}" -ne 0 ]; then
  cat "${harness_stderr}" >&2
  fail "legacy normalization block exited ${harness_status} in single-runtime mode"
fi
if grep -q 'back_green:8080' "${legacy_single_caddy}"; then
  fail "single-runtime rollback must keep normalizing legacy upstream tokens to back_blue"
fi
if [ "$(count_matches "${legacy_single_caddy}" 'back_blue:8080')" -ne "${placeholder_count}" ]; then
  fail "single-runtime normalization must rewrite every upstream token"
fi

# ---------------------------------------------------------------------------
# split rollback은 route verify 앞에서 helper를 복구해야 한다
#
# runtime-split에서 edge 트래픽의 목적지는 back_read/back_admin이다. verify_caddy_route()가
# 프로브하는 컨테이너가 곧 helper 복구 대상이므로, 후보 이미지가 원인인 실패에서는 복구 전
# verify가 통과할 수 없다. verify를 먼저 두면 rollback이 복구 앞에서 return 1로 끝나고
# 프로덕션이 깨진 이미지에 고착된다(#1409와 동일 클래스).
#
# 그래서 시나리오는 "후보 이미지가 트래픽을 받으면 죽는" 장애를 모델링한다. 컨테이너 health와
# edge HTTP 코드는 실제로 돌고 있는 이미지의 함수이고, edge가 어느 컨테이너를 서비스하는지는
# 프로덕션 current_caddy_upstream_host()가 결정한다.
# ---------------------------------------------------------------------------

rollback_state_dir="${workdir}/rollback-state"

setup_rollback_state() {
  rm -rf "${rollback_state_dir}"
  mkdir -p "${rollback_state_dir}/img" "${rollback_state_dir}/run"
  printf '%s' 'app:good' > "${rollback_state_dir}/img/back_blue"
  printf '%s' 'app:good' > "${rollback_state_dir}/run/back_blue"
  local service
  for service in back_green back_read back_admin back_worker; do
    printf '%s' 'app:broken' > "${rollback_state_dir}/img/${service}"
    printf '%s' 'app:broken' > "${rollback_state_dir}/run/${service}"
  done
}

running_image() {
  cat "${rollback_state_dir}/run/$1" 2>/dev/null || true
}

marker_line() {
  grep -n "$2" "$1" | head -n 1 | cut -d: -f1
}

run_rollback_scenario() {
  local split="$1"
  local caddy_file="$2"
  local env_file="$3"
  shift 3
  local harness="${workdir}/rollback-order-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'CADDY_FILE=%q\n' "${caddy_file}"
    printf 'ENV_FILE=%q\n' "${env_file}"
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    printf 'STATE_DIR=%q\n' "${rollback_state_dir}"
    printf 'STATE_FILE=%q\n' "${rollback_state_dir}/active-backend"
    cat <<'ROLLBACK_STUBS'
GOOD_IMAGE="app:good"
img_of() { cat "${STATE_DIR}/img/$1" 2>/dev/null || true; }
run_of() { cat "${STATE_DIR}/run/$1" 2>/dev/null || true; }

sleep() { :; }
mounted_env_value() { return 1; }
run_compose_diagnostic() { return 0; }
reload_caddy() { return 0; }
ensure_caddy_mount_sync() { return 0; }
resolve_in_caddy() { return 0; }
check_backend_dns_from_caddy() { printf 'dns ok: %s\n' "$1"; }
emit_backend_diagnostics() { return 0; }
runtime_backend_image_value() { img_of "$1"; }
upsert_runtime_backend_image() { printf '%s' "$2" > "${STATE_DIR}/img/$1"; }
is_backend_running() { [[ -n "$(run_of "$1")" ]]; }
drain_and_stop_backend_if_running() { : > "${STATE_DIR}/run/$1"; }
write_backend_release_state() { printf 'release state active=%s previous=%s\n' "$1" "$2"; }

compose() {
  local action="$1"
  shift
  local service
  case "${action}" in
    stop)
      for service in "$@"; do
        : > "${STATE_DIR}/run/${service}"
      done
      ;;
    up)
      for service in "$@"; do
        case "${service}" in
          -*) continue ;;
        esac
        printf '%s' "$(img_of "${service}")" > "${STATE_DIR}/run/${service}"
      done
      ;;
  esac
  return 0
}

compose_up_force_recreate_with_retry() {
  local service
  for service in "$@"; do
    printf '%s' "$(img_of "${service}")" > "${STATE_DIR}/run/${service}"
  done
  return 0
}

# 컨테이너 health는 실제로 돌고 있는 이미지의 함수다. 후보 이미지는 트래픽을 받으면 죽는다.
check_backend_health() {
  [[ "$(run_of "$1")" == "${GOOD_IMAGE}" ]]
}

# edge가 서비스하는 컨테이너는 프로덕션 current_caddy_upstream_host()가 정한다.
probe_caddy_http_code() {
  local serving
  serving="$(current_caddy_upstream_host)"
  if [[ -z "${serving}" || "$(run_of "${serving}")" != "${GOOD_IMAGE}" ]]; then
    printf '503'
    return 0
  fi
  printf '200'
}
ROLLBACK_STUBS
    extract_function "${deploy_script}" env_value
    extract_function "${deploy_script}" trim_quotes
    extract_function "${deploy_script}" upsert_env_key
    extract_function "${deploy_script}" normalize_backend_name
    extract_function "${deploy_script}" host_env_value
    extract_function "${deploy_script}" backend_http_host
    extract_function "${deploy_script}" resolve_caddy_upstream_token
    extract_function "${deploy_script}" current_caddy_upstream_host
    extract_function "${deploy_script}" expected_caddy_upstream_host
    extract_function "${deploy_script}" is_healthy_http_code
    extract_function "${deploy_script}" caddy_file_has_literal_colour_upstream
    extract_function "${deploy_script}" set_caddy_upstream_backend
    extract_function "${deploy_script}" switch_caddy_upstream
    extract_function "${deploy_script}" verify_caddy_route
    extract_function "${deploy_script}" runtime_split_helper_backends
    extract_function "${deploy_script}" restore_runtime_split_helper_backends_to_active
    extract_function "${deploy_script}" other_backend
    extract_function "${deploy_script}" rollback_caddy_route_only
    extract_function "${deploy_script}" rollback_to_backend
    printf '%s\n' 'entry="$1"'
    printf '%s\n' 'shift'
    printf '%s\n' '"${entry}" "$@"'
  } > "${harness}"

  run_harness "${harness}" "$@"
}

assert_recovery_before_verify() {
  local context="$1"
  local recovery_line verify_line
  recovery_line="$(marker_line "${harness_stdout}" 'recovering runtime helper backends')"
  verify_line="$(marker_line "${harness_stdout}" 'caddy route verify ok')"
  if [ -z "${recovery_line}" ]; then
    cat "${harness_stdout}" >&2
    fail "${context}: helper recovery never ran"
  fi
  if [ -z "${verify_line}" ]; then
    cat "${harness_stdout}" >&2
    fail "${context}: caddy route verify never succeeded"
  fi
  if [ "${recovery_line}" -ge "${verify_line}" ]; then
    cat "${harness_stdout}" >&2
    fail "${context}: runtime-split helper recovery must run before route verify"
  fi
}

for entry in rollback_to_backend rollback_caddy_route_only; do
  split_rollback_caddy="${workdir}/rollback-split-caddyfile"
  split_rollback_env="${workdir}/rollback-split-env"
  cp "${caddy_source}" "${split_rollback_caddy}"
  write_split_env "${split_rollback_env}"
  setup_rollback_state

  case "${entry}" in
    rollback_to_backend)
      run_rollback_scenario "true" "${split_rollback_caddy}" "${split_rollback_env}" \
        "${entry}" back_blue api.example.com
      ;;
    rollback_caddy_route_only)
      run_rollback_scenario "true" "${split_rollback_caddy}" "${split_rollback_env}" \
        "${entry}" back_blue back_green api.example.com
      ;;
  esac

  if [ "${harness_status}" -ne 0 ]; then
    cat "${harness_stdout}" "${harness_stderr}" >&2
    fail "runtime-split ${entry}() must finish the rollback, exited ${harness_status}"
  fi
  for helper in back_read back_admin back_worker; do
    if [ "$(running_image "${helper}")" != "app:good" ]; then
      cat "${harness_stdout}" "${harness_stderr}" >&2
      fail "runtime-split ${entry}() left helper ${helper} on the failed candidate image"
    fi
  done
  if [ -n "$(running_image back_green)" ]; then
    fail "runtime-split ${entry}() must stop the failed candidate"
  fi
  if [ "$(cat "${rollback_state_dir}/active-backend")" != "back_blue" ]; then
    fail "runtime-split ${entry}() must record the rollback target as active"
  fi
  assert_recovery_before_verify "runtime-split ${entry}()"
  if ! cmp -s "${caddy_source}" "${split_rollback_caddy}"; then
    fail "runtime-split ${entry}() rewrote the Caddyfile"
  fi
done

# 단일 런타임 helper(back_worker)는 edge 경로가 아니므로 기존 순서(verify -> 복구)를 유지한다.
single_rollback_caddy="${workdir}/rollback-single-caddyfile"
single_rollback_env="${workdir}/rollback-single-env"
cp "${caddy_source}" "${single_rollback_caddy}"
write_single_env "${single_rollback_env}"
setup_rollback_state
run_rollback_scenario "false" "${single_rollback_caddy}" "${single_rollback_env}" \
  rollback_to_backend back_blue api.example.com

if [ "${harness_status}" -ne 0 ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "single-runtime rollback_to_backend() must finish the rollback, exited ${harness_status}"
fi
if [ "$(running_image back_worker)" != "app:good" ]; then
  fail "single-runtime rollback_to_backend() must still recover back_worker to the active image"
fi
recovery_line="$(marker_line "${harness_stdout}" 'recovering runtime helper backends')"
verify_line="$(marker_line "${harness_stdout}" 'caddy route verify ok')"
if [ -z "${recovery_line}" ] || [ -z "${verify_line}" ]; then
  cat "${harness_stdout}" >&2
  fail "single-runtime rollback_to_backend() must both verify the route and recover helpers"
fi
if [ "${verify_line}" -ge "${recovery_line}" ]; then
  cat "${harness_stdout}" >&2
  fail "single-runtime rollback must keep helper recovery after route verify"
fi
if grep -q '{$ADMIN_API_UPSTREAM:' "${single_rollback_caddy}"; then
  fail "single-runtime rollback must pin the rollback colour into the Caddyfile"
fi

echo "[test] runtime-split caddy upstream contract ok"
