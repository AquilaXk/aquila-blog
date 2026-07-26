#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

deploy_script="deploy/homeserver/blue_green_deploy.sh"
rollback_script="deploy/homeserver/rollback_last_deploy.sh"
caddy_source="deploy/homeserver/caddy/Caddyfile"

for required in "${deploy_script}" "${rollback_script}" "${caddy_source}"; do
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

# 두 배포 스크립트는 docker와 홈서버 없이 통째로 실행할 수 없다. 그래서 검사 대상 함수만 원본
# 파일에서 떼어내 fixture 위에서 평가한다. 사본을 테스트에 적어 두면 원본이 회귀해도 통과하므로
# 항상 파일에서 읽는다.
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

# set_caddy_upstream_backend()를 fixture Caddyfile/env 위에서 실행한다. reload_caddy는 컨테이너를
# 요구하므로 marker 파일로 대체해 호출 여부만 관찰한다.
run_set_caddy_upstream_backend() {
  local script="$1"
  local split="$2"
  local backend="$3"
  local caddy_file="$4"
  local env_file="$5"
  local reload_marker="$6"
  local harness="${workdir}/harness-$$.sh"

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
    extract_function "${script}" set_caddy_upstream_backend
    printf '%s\n' 'set_caddy_upstream_backend "$1"'
  } > "${harness}"

  bash "${harness}" "${backend}"
  rm -f "${harness}"
}

# verify_caddy_route()가 cutover 후 기대하는 upstream과 Caddyfile이 실제로 가리키는 upstream을
# 각각 계산한다. 두 값이 어긋나면 배포가 실패해야 한다.
run_upstream_expectation() {
  local split="$1"
  local backend="$2"
  local caddy_file="$3"
  local env_file="$4"
  local harness="${workdir}/expect-$$.sh"

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

  bash "${harness}" "${backend}"
  rm -f "${harness}"
}

count_matches() {
  grep -cF "$2" "$1" || true
}

# 저장소에 커밋된 Caddyfile은 색 리터럴이 아니라 placeholder 형태여야 한다. 리터럴이 커밋되면
# runtime-split은 env 값과 무관하게 단일 컨테이너로 붕괴한다.
if grep -Eq 'back[-_](blue|green|active):8080' "${caddy_source}"; then
  fail "${caddy_source} must reference backends through {\$READ_API_UPSTREAM}/{\$ADMIN_API_UPSTREAM} placeholders, not literal colour hosts"
fi
if [ "$(count_matches "${caddy_source}" '{$ADMIN_API_UPSTREAM:')" -lt 1 ]; then
  fail "${caddy_source} lost the ADMIN_API_UPSTREAM placeholder"
fi
if [ "$(count_matches "${caddy_source}" '{$READ_API_UPSTREAM:')" -lt 1 ]; then
  fail "${caddy_source} lost the READ_API_UPSTREAM placeholder"
fi

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
    "${split_caddy}" "${split_env}" "${split_reload}" >/dev/null

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

  # 단일 런타임: 기존 동작 그대로 활성 색 리터럴로 치환하고 env 키도 갱신한다.
  single_caddy="${workdir}/single-caddyfile"
  single_env="${workdir}/single-env"
  single_reload="${workdir}/single-reload"
  cp "${caddy_source}" "${single_caddy}"
  write_single_env "${single_env}"
  rm -f "${single_reload}"

  run_set_caddy_upstream_backend "${script}" "false" "back_green" \
    "${single_caddy}" "${single_env}" "${single_reload}" >/dev/null

  if cmp -s "${caddy_source}" "${single_caddy}"; then
    fail "${label}: single-runtime cutover must pin the active colour into the Caddyfile"
  fi
  if grep -q '{$ADMIN_API_UPSTREAM:' "${single_caddy}" || grep -q '{$READ_API_UPSTREAM:' "${single_caddy}"; then
    fail "${label}: single-runtime cutover must replace every upstream placeholder"
  fi
  placeholder_count="$(( $(count_matches "${caddy_source}" '{$ADMIN_API_UPSTREAM:') + $(count_matches "${caddy_source}" '{$READ_API_UPSTREAM:') ))"
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
drift_caddy="${workdir}/drift-caddyfile"
sed -E \
  -e 's/\{\$ADMIN_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/back_green:8080/g' \
  -e 's/\{\$READ_API_UPSTREAM:back[-_](blue|green|read|admin)\}:8080/back_green:8080/g' \
  "${caddy_source}" > "${drift_caddy}"
result="$(run_upstream_expectation "true" "back_green" "${drift_caddy}" "${expect_env}")"
if [ "${result}" != "expected=back_admin current=back_green" ]; then
  fail "runtime-split route verification must reject a colour-pinned Caddyfile, got: ${result}"
fi

# 단일 런타임에서는 기존대로 활성 색을 기대한다.
single_expect_env="${workdir}/single-expect-env"
write_single_env "${single_expect_env}"
result="$(run_upstream_expectation "false" "back_green" "${drift_caddy}" "${single_expect_env}")"
if [ "${result}" != "expected=back_green current=back_green" ]; then
  fail "single-runtime route verification must expect the active colour, got: ${result}"
fi

echo "[test] runtime-split caddy upstream contract ok"
