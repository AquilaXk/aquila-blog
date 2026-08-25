#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

deploy_script="deploy/homeserver/blue_green_deploy.sh"
rollback_script="deploy/homeserver/rollback_last_deploy.sh"
probe_script="deploy/homeserver/caddy_upstream_probe.sh"
status_script="deploy/homeserver/check_deploy_status.sh"
caddy_source="deploy/homeserver/caddy/Caddyfile"

for required in "${deploy_script}" "${rollback_script}" "${probe_script}" "${status_script}" "${caddy_source}"; do
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
    printf '%s\n' 'RUNTIME_SPLIT_ENABLED=true'
    printf '%s\n' 'READ_API_UPSTREAM=back_read'
    printf '%s\n' 'ADMIN_API_UPSTREAM=back_admin'
  } > "$1"
}

write_single_env() {
  {
    printf '%s\n' 'RUNTIME_SPLIT_ENABLED=false'
    printf '%s\n' 'READ_API_UPSTREAM=back_blue'
    printf '%s\n' 'ADMIN_API_UPSTREAM=back_blue'
  } > "$1"
}

# ADMIN_API_UPSTREAM이 없는 split env. placeholder 기본값 fallback과 기대값 fail-fast를 본다.
write_split_env_without_admin() {
  {
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

# 첫 reverse_proxy upstream placeholder의 기본값. 값을 테스트에 적어 두면 기본값이 바뀔 때
# (계약 위반이 아닌데도) 이 단언이 깨지고 실패 메시지가 원인을 알려주지 못한다.
first_placeholder_default="$(
  awk '$1 == "reverse_proxy" && $2 ~ /^\{\$(ADMIN_API_UPSTREAM|READ_API_UPSTREAM):back[-_](blue|green|read|admin)\}:8080$/ {print $2; exit}' \
    "${caddy_source}" \
    | sed -E 's/^\{\$[A-Z_]+:(back[-_][a-z]+)\}:8080$/\1/' \
    | tr '-' '_'
)"
if ! printf '%s' "${first_placeholder_default}" | grep -Eq '^back_(blue|green|read|admin)$'; then
  fail "cannot derive the first upstream placeholder default from ${caddy_source}, got: ${first_placeholder_default:-empty}"
fi

# ---------------------------------------------------------------------------
# backend upstream 토큰 awk 패턴은 세 파일에서 동일해야 한다
#
# 토큰 해석은 probe와 두 배포 스크립트에 각각 구현돼 있다. 한쪽 패턴만 고치면 cutover의 판정과
# 후검증 게이트의 판정이 갈린다. 구현 통합은 배포 크리티컬 스크립트를 외부 파일 source에
# 의존하게 만들므로, 대신 패턴 문자열의 동일성을 기계적으로 고정한다.
#
# :8080 토큰으로 한정한다. front web vhost의 upstream 토큰(:3000, WEB_UPSTREAM)은 별개 계약이고
# 이 세 파일에 같은 형태로 존재하지도 않는다 — 그쪽은 front-blue-green-cutover.test.sh가 본다.
# 한정하지 않으면 front 토큰이 "두 개 이상"으로 잡혀 backend 드리프트와 구분되지 않는다.
# ---------------------------------------------------------------------------

upstream_token_pattern_of() {
  local script="$1"
  local patterns
  patterns="$(grep -hoE '\$1 == "reverse_proxy" && \$2 ~ /[^/]+/' "${script}" | grep -F ':8080' | sort -u)"
  if [ -z "${patterns}" ]; then
    fail "cannot find the backend upstream token awk pattern in ${script}; the pattern drift guard would pass vacuously"
  fi
  if [ "$(printf '%s\n' "${patterns}" | wc -l | tr -d '[:space:]')" -ne 1 ]; then
    printf '%s\n' "${patterns}" >&2
    fail "${script} carries more than one backend upstream token awk pattern"
  fi
  printf '%s' "${patterns}"
}

deploy_token_pattern="$(upstream_token_pattern_of "${deploy_script}")"
rollback_token_pattern="$(upstream_token_pattern_of "${rollback_script}")"
probe_token_pattern="$(upstream_token_pattern_of "${probe_script}")"
if [ "${rollback_token_pattern}" != "${deploy_token_pattern}" ] || [ "${probe_token_pattern}" != "${deploy_token_pattern}" ]; then
  printf '[test] %s: %s\n' "${deploy_script}" "${deploy_token_pattern}" >&2
  printf '[test] %s: %s\n' "${rollback_script}" "${rollback_token_pattern}" >&2
  printf '[test] %s: %s\n' "${probe_script}" "${probe_token_pattern}" >&2
  fail "upstream token awk pattern drifted between the probe and the deploy scripts"
fi

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
    printf '%s\n' 'mounted_env_value() { return 1; }'
    extract_function "${script}" env_value
    extract_function "${script}" trim_quotes
    extract_function "${script}" upsert_env_key
    extract_function "${script}" normalize_backend_name
    extract_function "${script}" host_env_value
    extract_function "${script}" backend_http_host
    extract_function "${script}" caddy_file_has_literal_colour_upstream
    # 드리프트 결과 보고는 cutover 스크립트에만 있다. rollback에는 verify_caddy_route가 없어서
    # 기대값을 계산할 대상 자체가 없다.
    if [ "${script}" = "${deploy_script}" ]; then
      extract_function "${script}" resolve_caddy_upstream_token
      extract_function "${script}" current_caddy_upstream_host
      extract_function "${script}" expected_caddy_upstream_host
      extract_function "${script}" report_caddy_split_literal_drift
    fi
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

  # 부분 드리프트는 route 검증이 읽는 토큰을 비켜 가므로 이 배포는 그대로 성공 보고된다. 경고가
  # "실패한다"로 뭉개지면 운영자는 배포가 죽을 것으로 오판하고, 반대로 아무 말도 없으면 열화가
  # 성공으로 보고된다. 둘 다 부정직하므로 실제로 해당하는 결과만 나와야 한다.
  if [ "${script}" = "${deploy_script}" ]; then
    if ! grep -q 'still passes caddy route verify' "${harness_stderr}"; then
      cat "${harness_stderr}" >&2
      fail "${label}: cutover must state that a drift the route verify cannot see is reported as success"
    fi
    if grep -q 'cannot succeed' "${harness_stderr}"; then
      cat "${harness_stderr}" >&2
      fail "${label}: cutover must not claim a drift the route verify cannot see fails the deploy"
    fi
  else
    if ! grep -q 'no route verify that could catch the drift' "${harness_stderr}"; then
      cat "${harness_stderr}" >&2
      fail "${label}: rollback must state that it has no route verify to catch the drift"
    fi
  fi

  # 전체 드리프트: 첫 reverse_proxy 토큰까지 리터럴이면 route 검증이 반드시 어긋난다. "경고만 하고
  # 계속"이 아니라 "이 배포는 실패하고 rollback으로 간다"가 참이므로 로그가 그렇게 말해야 한다.
  if [ "${script}" = "${deploy_script}" ]; then
    full_drift_cutover_caddy="${workdir}/split-full-drift-caddyfile"
    full_drift_cutover_env="${workdir}/split-full-drift-env"
    full_drift_cutover_reload="${workdir}/split-full-drift-reload"
    write_full_drift_caddyfile "${full_drift_cutover_caddy}"
    write_split_env "${full_drift_cutover_env}"
    rm -f "${full_drift_cutover_reload}"

    run_set_caddy_upstream_backend "${script}" "true" "back_green" \
      "${full_drift_cutover_caddy}" "${full_drift_cutover_env}" "${full_drift_cutover_reload}"
    if [ "${harness_status}" -ne 0 ]; then
      cat "${harness_stderr}" >&2
      fail "${label}: runtime-split cutover on a fully drifted Caddyfile exited ${harness_status}"
    fi
    if ! grep -q 'cannot succeed' "${harness_stderr}"; then
      cat "${harness_stderr}" >&2
      fail "${label}: cutover must state that a drift reaching the verified upstream token fails this deploy"
    fi
    if ! grep -q 'current=back_green' "${harness_stderr}" || ! grep -q 'expected=back_admin' "${harness_stderr}"; then
      cat "${harness_stderr}" >&2
      fail "${label}: cutover must log the measured upstream mismatch, not a generic warning"
    fi
    if grep -q 'still passes caddy route verify' "${harness_stderr}"; then
      cat "${harness_stderr}" >&2
      fail "${label}: cutover must not claim route verify passes on a fully drifted Caddyfile"
    fi
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
  # -F 고정: placeholder 토큰의 `{`는 BRE에서 동작이 정의되지 않은 문자다. 실제로 ugrep 같은
  # drop-in grep에서는 매칭이 안 되고, 그러면 이 검사가 조용히 절대 발화하지 않는다.
  if grep -qF '{$ADMIN_API_UPSTREAM:' "${single_caddy}" || grep -qF '{$READ_API_UPSTREAM:' "${single_caddy}"; then
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
expect_probe_output "${first_placeholder_default}" \
  "host with an unset upstream key (placeholder default derived from ${caddy_source})"

# host/mounted 계약(probe 주석 18-20행): 해석 실패는 빈 줄이다. Caddyfile이 없을 때 awk가 죽으면
# set -e로 probe가 비정상 종료하고, recover.sh의 `|| true`가 그 위반을 가린다.
run_probe "${workdir}/absent-caddyfile" "${expect_env}" host
expect_probe_output "" "host with an absent Caddyfile"

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
if [ "${STUB_CONSUME_STDIN:-false}" = "true" ]; then
  cat >/dev/null
fi
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

# production deploy는 remote `bash -s` payload 안에서 mounted probe를 호출한다. compose exec가
# inherited stdin을 읽어도 probe 뒤 payload와 sentinel은 caller에 남아 있어야 한다.
stdin_probe_status=0
stdin_probe_output="$(
  printf '%s\n' 'sentinel' | env -u RUNTIME_SPLIT_ENABLED LC_ALL=C LANG=C \
    PATH="${docker_stub_dir}:${PATH}" \
    STUB_CONSUME_STDIN=true \
    STUB_MOUNTED_CADDY="${expect_caddy}" STUB_MOUNTED_ENV="${mounted_env}" \
    CADDY_FILE="${expect_caddy}" ENV_FILE="${split_env_no_admin}" \
    PROBE_SCRIPT="${probe_script}" \
    bash -c '
      bash "${PROBE_SCRIPT}" mounted
      IFS= read -r remaining || exit 98
      printf "remaining=%s\n" "${remaining}"
    '
)" || stdin_probe_status=$?
if [ "${stdin_probe_status}" -ne 0 ]; then
  fail "caddy_upstream_probe.sh mounted consumed caller stdin (status ${stdin_probe_status})"
fi
if [ "${stdin_probe_output}" != $'back_admin\nremaining=sentinel' ]; then
  fail "caddy_upstream_probe.sh mounted must preserve upstream output and caller stdin, got: ${stdin_probe_output:-empty}"
fi

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
# rollback 완료 라인은 남은 열화를 숨기지 않아야 한다
#
# 이 스크립트에는 verify_caddy_route가 없고 종료 코드는 0으로 유지된다: non-zero면 deploy.yml의
# run_backup_rollback()이 남은 복구 단계를 건너뛰어 서비스가 이미 돌아온 뒤에도 장애가 길어진다
# (#1409 클래스). 그래서 완료 라인이 열화 상태의 유일한 즉시 신호이며, 그 라인이 평소와 같은
# 성공 문구를 내면 운영자가 성공으로 오판한다.
# ---------------------------------------------------------------------------

extract_rollback_completion_block() {
  local block
  block="$(
    awk '
      index($0, "if [[ \"${RUNTIME_SPLIT_ENABLED}\" == \"true\" ]] && caddy_file_has_literal_colour_upstream; then") == 1 { capture = 1 }
      capture { print }
      capture && $0 == "fi" { exit }
    ' "${rollback_script}"
  )"
  if [ -z "${block}" ] || ! printf '%s' "${block}" | grep -q 'rollback completed'; then
    fail "cannot extract the rollback completion block from ${rollback_script}"
  fi
  printf '%s\n' "${block}"
}

run_rollback_completion() {
  local split="$1"
  local caddy_file="$2"
  local harness="${workdir}/rollback-completion-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'CADDY_FILE=%q\n' "${caddy_file}"
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    printf '%s\n' 'target_backend=back_blue'
    printf '%s\n' 'inactive_backend=back_green'
    extract_function "${rollback_script}" caddy_file_has_literal_colour_upstream
    extract_rollback_completion_block
  } > "${harness}"

  run_harness "${harness}"
}

assert_rollback_completion_exit_zero() {
  if [ "${harness_status}" -ne 0 ]; then
    cat "${harness_stdout}" "${harness_stderr}" >&2
    fail "$1: the rollback completion line must not change the exit code (#1409: a non-zero rollback makes deploy.yml skip the remaining recovery steps)"
  fi
}

completion_placeholder_caddy="${workdir}/completion-placeholder-caddyfile"
cp "${caddy_source}" "${completion_placeholder_caddy}"
run_rollback_completion "true" "${completion_placeholder_caddy}"
assert_rollback_completion_exit_zero "runtime-split rollback on a placeholder Caddyfile"
if ! grep -q 'rollback completed: active=back_blue' "${harness_stdout}"; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "runtime-split rollback on a placeholder Caddyfile must report a plain completion"
fi
if grep -q 'degraded' "${harness_stderr}"; then
  cat "${harness_stderr}" >&2
  fail "runtime-split rollback must not report a degraded edge when the Caddyfile is placeholder-only"
fi

for completion_fixture in write_partial_drift_caddyfile write_full_drift_caddyfile; do
  completion_drift_caddy="${workdir}/completion-drift-caddyfile"
  "${completion_fixture}" "${completion_drift_caddy}"
  run_rollback_completion "true" "${completion_drift_caddy}"
  assert_rollback_completion_exit_zero "runtime-split rollback with ${completion_fixture}"
  if ! grep -q 'rollback completed with a degraded edge' "${harness_stderr}"; then
    cat "${harness_stdout}" "${harness_stderr}" >&2
    fail "runtime-split rollback (${completion_fixture}) must report the degraded edge it left behind"
  fi
  if grep -q 'rollback completed' "${harness_stdout}"; then
    cat "${harness_stdout}" >&2
    fail "runtime-split rollback (${completion_fixture}) must not also print a plain success completion"
  fi
done

# 단일 런타임에서는 색 리터럴이 정상이므로 완료 라인이 열화로 바뀌면 안 된다.
completion_single_caddy="${workdir}/completion-single-caddyfile"
write_full_drift_caddyfile "${completion_single_caddy}"
run_rollback_completion "false" "${completion_single_caddy}"
assert_rollback_completion_exit_zero "single-runtime rollback on a colour-pinned Caddyfile"
if ! grep -q 'rollback completed: active=back_blue' "${harness_stdout}"; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "single-runtime rollback must keep reporting a plain completion for a colour-pinned Caddyfile"
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
worker_ready_override="false"
checked_stop_failure_service=""
snapshot_query_failure="false"

setup_rollback_state() {
  rm -rf "${rollback_state_dir}"
  mkdir -p "${rollback_state_dir}/img" "${rollback_state_dir}/run" "${rollback_state_dir}/stopped"
  : > "${rollback_state_dir}/checked-stop"
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
    printf 'CHECKED_STOP_FAILURE_SERVICE=%q\n' "${checked_stop_failure_service}"
    printf 'SNAPSHOT_QUERY_FAILURE=%q\n' "${snapshot_query_failure}"
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
checked_stop_backend_service_if_running() {
  printf '%s\n' "$1" >> "${STATE_DIR}/checked-stop"
  if [[ -n "$(run_of "$1")" ]]; then
    printf '%s' "$(run_of "$1")" > "${STATE_DIR}/stopped/$1"
    : > "${STATE_DIR}/run/$1"
  fi
  [[ "$1" != "${CHECKED_STOP_FAILURE_SERVICE}" ]]
}
write_backend_release_state() { printf 'release state active=%s previous=%s\n' "$1" "$2"; }

compose() {
  local action="$1"
  shift
  local service
  case "${action}" in
    ps)
      if [[ "${SNAPSHOT_QUERY_FAILURE}" == "true" ]]; then
        return 1
      fi
      for service in back_read back_admin back_worker; do
        if [[ -n "$(run_of "${service}")" ]]; then
          printf '%s\n' "${service}"
        fi
      done
      ;;
    stop)
      for service in "$@"; do
        : > "${STATE_DIR}/run/${service}"
      done
      ;;
    start)
      for service in "$@"; do
        printf '%s' "$(cat "${STATE_DIR}/stopped/${service}" 2>/dev/null || true)" > "${STATE_DIR}/run/${service}"
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
  [[ "$(run_of "$1")" == "${GOOD_IMAGE}" || ( "$1" == "back_worker" && "$(run_of "$1")" == "app:worker-v2" ) ]]
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
    printf 'TASK_SCHEMA_COMPATIBLE_WORKER_READY=%q\n' "${worker_ready_override}"
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
    extract_function "${deploy_script}" report_caddy_split_literal_drift
    extract_function "${deploy_script}" set_caddy_upstream_backend
    extract_function "${deploy_script}" switch_caddy_upstream
    extract_function "${deploy_script}" verify_caddy_route
    extract_function "${deploy_script}" runtime_split_helper_backends
    extract_function "${deploy_script}" snapshot_running_runtime_split_helpers
    extract_function "${deploy_script}" restore_running_runtime_split_helpers
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

# running helper snapshot 조회가 실패하면 stop/recreate 전에 실패해야 하며, 이미 실행 중이던
# helper 상태를 건드리면 안 된다.
split_rollback_caddy="${workdir}/rollback-snapshot-failure-caddyfile"
split_rollback_env="${workdir}/rollback-snapshot-failure-env"
cp "${caddy_source}" "${split_rollback_caddy}"
write_split_env "${split_rollback_env}"
setup_rollback_state
for helper in back_read back_admin back_worker; do
  printf '%s' 'app:good' > "${rollback_state_dir}/img/${helper}"
  printf '%s' 'app:good' > "${rollback_state_dir}/run/${helper}"
done
snapshot_query_failure="true"
run_rollback_scenario "true" "${split_rollback_caddy}" "${split_rollback_env}" \
  rollback_to_backend back_blue api.example.com
snapshot_query_failure="false"

if [ "${harness_status}" -eq 0 ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "helper snapshot query failure must keep rollback nonzero"
fi
if [ -s "${rollback_state_dir}/checked-stop" ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "helper snapshot query failure must not call checked stop"
fi
for helper in back_read back_admin back_worker; do
  if [ "$(running_image "${helper}")" != "app:good" ]; then
    cat "${harness_stdout}" "${harness_stderr}" >&2
    fail "helper snapshot query failure must preserve running ${helper}"
  fi
done

# 뒤 helper의 checked-stop evidence가 실패하면 앞서 정지된 기존 helper도 같은 컨테이너 이미지로
# 다시 시작해 healthy 상태로 복구해야 한다. 원 rollback은 실패로 유지한다.
split_rollback_caddy="${workdir}/rollback-partial-stop-caddyfile"
split_rollback_env="${workdir}/rollback-partial-stop-env"
cp "${caddy_source}" "${split_rollback_caddy}"
write_split_env "${split_rollback_env}"
setup_rollback_state
for helper in back_read back_admin back_worker; do
  printf '%s' 'app:good' > "${rollback_state_dir}/img/${helper}"
  printf '%s' 'app:good' > "${rollback_state_dir}/run/${helper}"
done
checked_stop_failure_service="back_admin"
run_rollback_scenario "true" "${split_rollback_caddy}" "${split_rollback_env}" \
  rollback_to_backend back_blue api.example.com
checked_stop_failure_service=""

if [ "${harness_status}" -eq 0 ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "partial helper checked-stop failure must keep rollback nonzero"
fi
for helper in back_read back_admin back_worker; do
  if [ "$(running_image "${helper}")" != "app:good" ]; then
    cat "${harness_stdout}" "${harness_stderr}" >&2
    fail "partial helper checked-stop failure must restore running healthy ${helper}"
  fi
done

# candidate worker가 health를 통과한 뒤에는 API/read/admin rollback이 worker image를
# N-1으로 내리지 않는다. 이전 API의 insert는 DB trigger가 flat v1으로 정규화하고,
# schema-compatible worker는 v1/v2를 모두 exact decoder로 처리한다.
split_rollback_caddy="${workdir}/rollback-worker-floor-caddyfile"
split_rollback_env="${workdir}/rollback-worker-floor-env"
cp "${caddy_source}" "${split_rollback_caddy}"
write_split_env "${split_rollback_env}"
setup_rollback_state
printf '%s' 'app:worker-v2' > "${rollback_state_dir}/img/back_worker"
printf '%s' 'app:worker-v2' > "${rollback_state_dir}/run/back_worker"
worker_ready_override="true"
run_rollback_scenario "true" "${split_rollback_caddy}" "${split_rollback_env}" \
  rollback_caddy_route_only back_blue back_green api.example.com
worker_ready_override="false"

if [ "${harness_status}" -ne 0 ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "schema-compatible worker rollback scenario exited ${harness_status}"
fi
for helper in back_read back_admin; do
  if [ "$(running_image "${helper}")" != "app:good" ]; then
    fail "schema-compatible rollback must restore ${helper} to the previous API image"
  fi
done
if [ "$(running_image back_worker)" != "app:worker-v2" ]; then
  fail "schema-compatible rollback must not downgrade back_worker"
fi
if ! grep -q 'preserving schema-compatible worker image during API rollback' "${harness_stdout}"; then
  fail "schema-compatible worker preservation must be visible in rollback evidence"
fi

# outer backup rollback도 DB schema identity가 같을 때만 worker downgrade를 허용한다.
worker_policy_harness="${workdir}/worker-rollback-policy-harness.sh"
{
  printf '%s\n' 'set -euo pipefail'
  extract_function "${rollback_script}" is_canonical_flyway_schema_version
  extract_function "${rollback_script}" worker_rollback_mode
  printf '%s\n' 'worker_rollback_mode "$1" "$2"'
} > "${worker_policy_harness}"

run_harness "${worker_policy_harness}" 20260811.01 20260811.01
if [ "${harness_status}" -ne 0 ] || [ "$(cat "${harness_stdout}")" != "restore" ]; then
  fail "equal backup/live Flyway versions must allow the backed-up worker image"
fi
run_harness "${worker_policy_harness}" 20260810.01 20260811.01
if [ "${harness_status}" -ne 0 ] || [ "$(cat "${harness_stdout}")" != "preserve" ]; then
  fail "advanced live Flyway version must preserve the current worker image"
fi
run_harness "${worker_policy_harness}" unavailable 20260811.01
if [ "${harness_status}" -ne 0 ] || [ "$(cat "${harness_stdout}")" != "preserve" ]; then
  fail "unproven Flyway identity must fail closed to current worker preservation"
fi

worker_policy_prepare_harness="${workdir}/worker-rollback-prepare-harness.sh"
{
  printf '%s\n' 'set -euo pipefail'
  printf '%s\n' 'PRESERVE_CURRENT_WORKER_IMAGE="false"'
  printf '%s\n' 'CURRENT_WORKER_IMAGE=""'
  printf '%s\n' 'BACKUP_VERSION="$1"'
  printf '%s\n' 'LIVE_VERSION="$2"'
  printf '%s\n' 'WORKER_IMAGE="$3"'
  cat <<'WORKER_POLICY_STUBS'
trim_quotes() { printf '%s\n' "$1"; }
backup_metadata_value() { printf '%s\n' "${BACKUP_VERSION}"; }
query_live_flyway_schema_version() { printf '%s\n' "${LIVE_VERSION}"; }
container_image_for_service_any_state() { printf '%s\n' "${WORKER_IMAGE}"; }
require_digest_image_value() {
  [[ "$2" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]]
}
WORKER_POLICY_STUBS
  extract_function "${rollback_script}" is_canonical_flyway_schema_version
  extract_function "${rollback_script}" worker_rollback_mode
  extract_function "${rollback_script}" prepare_worker_rollback_policy
  printf '%s\n' 'prepare_worker_rollback_policy'
  printf '%s\n' 'printf "%s|%s\n" "${PRESERVE_CURRENT_WORKER_IMAGE}" "${CURRENT_WORKER_IMAGE}"'
} > "${worker_policy_prepare_harness}"

schema_worker_digest="registry.example/back@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
run_harness "${worker_policy_prepare_harness}" 20260810.01 20260811.01 "${schema_worker_digest}"
if [ "${harness_status}" -ne 0 ] || ! grep -qF "true|${schema_worker_digest}" "${harness_stdout}"; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "advanced schema rollback must pin the proven current worker digest"
fi

run_harness "${worker_policy_prepare_harness}" 20260810.01 20260811.01 ""
if [ "${harness_status}" -eq 0 ]; then
  fail "advanced schema rollback must fail closed when the current worker digest is missing"
fi
if ! grep -q 'current worker image cannot be proven' "${harness_stderr}"; then
  cat "${harness_stderr}" >&2
  fail "worker identity failure must have a sanitized diagnostic"
fi

worker_floor_harness="${workdir}/worker-floor-harness.sh"
{
  printf '%s\n' 'set -euo pipefail'
  printf '%s\n' 'BACKUP_FLYWAY_SCHEMA_VERSION="$1"'
  printf '%s\n' 'LIVE_VERSION="$2"'
  printf '%s\n' 'TASK_SCHEMA_WORKER_FLOOR_REQUIRED="false"'
  printf '%s\n' 'query_live_flyway_schema_version() { printf "%s\\n" "${LIVE_VERSION}"; }'
  extract_function "${deploy_script}" is_canonical_flyway_schema_version
  extract_function "${deploy_script}" worker_rollback_mode
  extract_function "${deploy_script}" resolve_task_schema_worker_floor
  printf '%s\n' 'resolve_task_schema_worker_floor'
  printf '%s\n' 'printf "%s\\n" "${TASK_SCHEMA_WORKER_FLOOR_REQUIRED}"'
} > "${worker_floor_harness}"

run_harness "${worker_floor_harness}" 20260811.01 20260811.01
if [ "${harness_status}" -ne 0 ] || [ "$(tail -n 1 "${harness_stdout}")" != "false" ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "unchanged schema must keep normal worker rollback enabled"
fi
run_harness "${worker_floor_harness}" 20260810.01 20260811.01
if [ "${harness_status}" -ne 0 ] || [ "$(tail -n 1 "${harness_stdout}")" != "true" ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "advanced schema must require the candidate worker floor"
fi
run_harness "${worker_floor_harness}" unavailable 20260811.01
if [ "${harness_status}" -ne 0 ] || [ "$(tail -n 1 "${harness_stdout}")" != "true" ]; then
  cat "${harness_stdout}" "${harness_stderr}" >&2
  fail "unproven backup schema must fail closed to the candidate worker floor"
fi

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
if grep -qF '{$ADMIN_API_UPSTREAM:' "${single_rollback_caddy}"; then
  fail "single-runtime rollback must pin the rollback colour into the Caddyfile"
fi

# ---------------------------------------------------------------------------
# check_deploy_status.sh의 split 리터럴 감지
#
# rollback은 리터럴 잔존을 종료 코드로 신고할 수 없다(#1409: non-zero면 deploy.yml이 남은 복구
# 단계를 건너뛴다). 그래서 이 감지가 열화 상태의 out-of-band 신호이며, 감지 표현식이 부분
# 드리프트까지 잡는지 실측해야 신호가 공허하지 않다. mounted_upstream 비교는 토큰 하나만 보므로
# forward_auth/read 한 줄 드리프트는 그 비교를 통과한다.
# ---------------------------------------------------------------------------

extract_split_literal_detector_block() {
  local block
  block="$(
    awk '
      index($0, "HAS_SPLIT_LITERAL_UPSTREAM=\"false\"") == 1 { capture = 1 }
      capture { print }
      capture && $0 == "fi" { exit }
    ' "${status_script}"
  )"
  # 감지 표현식 자체는 아래 fixture 실행으로 판정한다. 여기서는 블록이 값을 세우는 구조인지만
  # 본다 — 표현식 내용을 여기서 grep하면 표현식 회귀가 실행 검사 대신 추출 실패로 나타난다.
  if [ -z "${block}" ] || ! printf '%s' "${block}" | grep -q 'HAS_SPLIT_LITERAL_UPSTREAM="true"'; then
    fail "cannot extract the runtime-split literal upstream detector from ${status_script}"
  fi
  printf '%s\n' "${block}"
}

run_split_literal_detector() {
  local split="$1"
  local caddy_file="$2"
  local harness="${workdir}/split-literal-detector-harness.sh"

  {
    printf '%s\n' 'set -euo pipefail'
    printf 'RUNTIME_SPLIT_ENABLED=%q\n' "${split}"
    printf 'CADDY_CONTAINER_FILE=%q\n' "${caddy_file}"
    # `compose exec -T caddy sh -lc "<cmd>"` 의 마지막 인자를 로컬 sh로 실행한다. 검증 대상은
    # 컨테이너 배선이 아니라 grep 표현식이 어떤 파일 상태를 잡는지다.
    printf '%s\n' 'compose() { sh -c "${!#}"; }'
    extract_split_literal_detector_block
    printf '%s\n' 'printf "%s\n" "${HAS_SPLIT_LITERAL_UPSTREAM}"'
  } > "${harness}"

  run_harness "${harness}"
}

expect_split_literal_detector() {
  local expected="$1"
  local context="$2"
  local actual
  actual="$(cat "${harness_stdout}")"
  if [ "${harness_status}" -ne 0 ]; then
    cat "${harness_stderr}" >&2
    fail "split literal detector ${context} exited ${harness_status}"
  fi
  if [ "${actual}" != "${expected}" ]; then
    cat "${harness_stderr}" >&2
    fail "split literal detector ${context} must report ${expected}, got: ${actual:-empty}"
  fi
}

detector_caddy="${workdir}/detector-caddyfile"

cp "${caddy_source}" "${detector_caddy}"
run_split_literal_detector "true" "${detector_caddy}"
expect_split_literal_detector "false" "on a placeholder Caddyfile under runtime-split"

write_partial_drift_caddyfile "${detector_caddy}"
run_split_literal_detector "true" "${detector_caddy}"
expect_split_literal_detector "true" "on a partially drifted Caddyfile under runtime-split"

write_full_drift_caddyfile "${detector_caddy}"
run_split_literal_detector "true" "${detector_caddy}"
expect_split_literal_detector "true" "on a fully drifted Caddyfile under runtime-split"

run_split_literal_detector "false" "${detector_caddy}"
expect_split_literal_detector "false" "on a colour-pinned Caddyfile in single-runtime mode"

# 감지가 FAIL로 이어지는 배선. 감지만 하고 remember_failure를 안 부르면 exit code가 안 바뀐다.
if ! grep -q 'remember_failure "caddy_split_literal_upstream' "${status_script}"; then
  fail "${status_script} must turn a detected runtime-split literal upstream into a FAIL"
fi

echo "[test] runtime-split caddy upstream contract ok"
