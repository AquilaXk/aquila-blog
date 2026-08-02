#!/usr/bin/env bash
set -euo pipefail

# front blue/green cutover 계약 (#1539).
#
# 여기서 막으려는 결함은 "성공으로 보고되는 열화"다: health를 확인하지 않은 전환, 실패했는데 0으로
# 끝나는 rollback, 컨테이너가 떴다는 사실만으로 통과하는 검증. 그래서 각 케이스는 "그 상황에서
# 실제로 실패하는가"를 본다.
#
# blue_green_deploy.sh는 docker와 홈서버 없이 통째로 실행할 수 없으므로 검사 대상 함수만 원본
# 파일에서 떼어내 fixture 위에서 평가한다(runtime-split-caddy-upstream.test.sh와 같은 방식).
# 사본을 테스트에 적어 두면 원본이 회귀해도 통과하므로 항상 파일에서 읽고, 이름이 바뀌어 추출에
# 실패하면 테스트가 조용히 비어 버리므로 추출 결과를 먼저 검증한다.

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

deploy_script="deploy/homeserver/blue_green_deploy.sh"
caddy_source="deploy/homeserver/caddy/Caddyfile"

for required in "${deploy_script}" "${caddy_source}"; do
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
# 함수 추출 + 무결성 가드
# ---------------------------------------------------------------------------

extracted_functions=(
  trim_quotes
  env_value
  host_env_value
  upsert_env_key
  normalize_backend_name
  require_digest_image_value
  is_healthy_http_code
  compose_profiles_from_env_file
  resolve_compose_profiles
  compose_profile_enabled
  front_image_key
  other_front
  runtime_front_image_value
  upsert_runtime_front_image
  detect_active_front
  resolve_preserved_front_image
  prepare_front_runtime_images
  persist_front_caddy_upstream
  front_edge_host
  check_front_health
  resolve_caddy_web_upstream_token
  switch_caddy_web_upstream
  verify_front_edge_route
  write_front_release_state
  rollback_front_to
  run_front_blue_green_deploy
)

extract_function() {
  local name="$1"
  local source_file="$2"
  awk -v fn="${name}" '
    $0 ~ "^" fn "\\(\\) \\{" { capture = 1 }
    capture { print }
    capture && $0 == "}" { exit }
  ' "${source_file}"
}

extracted="${workdir}/extracted.sh"
: > "${extracted}"
for fn in "${extracted_functions[@]}"; do
  extract_function "${fn}" "${deploy_script}" >> "${extracted}"
  printf '\n' >> "${extracted}"
  if ! grep -q "^${fn}() {" "${extracted}"; then
    fail "cannot extract ${fn} from ${deploy_script}; the harness would evaluate nothing"
  fi
done

# 원본이 이 목록 밖의 함수를 부르면 bash가 127로 죽고, 그 호출이 조건문 안이면 조건이 false로
# 흘러 테스트가 조용히 통과한다. 스텁으로 정의하지 않은 프로덕션 함수 이름이 남아 있는지 본다.
production_functions="${workdir}/production-functions"
grep -hoE '^[A-Za-z_][A-Za-z0-9_]*\(\)' "${deploy_script}" | sed 's/()$//' | sort -u > "${production_functions}"
if [ ! -s "${production_functions}" ]; then
  fail "cannot enumerate production function names; the closure guard would pass vacuously"
fi

# ---------------------------------------------------------------------------
# 스텁: docker/compose에 닿는 leaf만 대체한다. 판정 로직은 전부 원본 그대로다.
# ---------------------------------------------------------------------------

stubs="${workdir}/stubs.sh"
cat > "${stubs}" <<'STUBS'
sleep() { :; }

front_service_running() {
  local service="$1"
  grep -qx "${service}" "${STUB_RUNNING_FRONT_FILE}" 2>/dev/null
}

container_image_for_service_any_state() {
  local service="$1"
  awk -F= -v k="${1}" '$1 == k { print substr($0, index($0, "=") + 1) }' "${STUB_CONTAINER_IMAGE_FILE}" 2>/dev/null | tail -n 1
  return 0
}

front_container_health() {
  local service="$1"
  local value
  value="$(awk -F= -v k="${service}" '$1 == k { print substr($0, index($0, "=") + 1) }' "${STUB_HEALTH_FILE}" 2>/dev/null | tail -n 1)"
  printf '%s' "${value:-none}"
}

probe_front_http_code() {
  local service="$1"
  local path="$2"
  local value
  value="$(awk -F= -v k="${service}${path}" '$1 == k { print substr($0, index($0, "=") + 1) }' "${STUB_FRONT_HTTP_FILE}" 2>/dev/null | tail -n 1)"
  printf '%s' "${value:-000}"
}

probe_web_edge_http_code() {
  printf '%s' "${STUB_EDGE_HTTP_CODE:-200}"
}

# 서빙 중인 색에 따라 다른 빌드 sha를 돌려준다. rollback이 "이전 빌드가 다시 서빙되는지"까지
# 확인하는지 보려면 이 값이 색과 함께 움직여야 한다.
served_front_build_sha() {
  local colour
  colour="$(current_caddy_web_upstream_host)"
  awk -F= -v k="${colour}" '$1 == k { print substr($0, index($0, "=") + 1) }' "${STUB_SERVED_SHA_FILE}" 2>/dev/null | tail -n 1
  return 0
}

resolve_in_caddy() { return 0; }
reload_caddy() { printf 'reload_caddy\n' >> "${STUB_CALL_LOG}"; }
ensure_caddy_mount_sync() { printf 'ensure_caddy_mount_sync\n' >> "${STUB_CALL_LOG}"; }
emit_backend_diagnostics() { return 0; }
run_compose_diagnostic() { return 0; }

mounted_env_value() {
  host_env_value "$1"
}

# 마운트된 Caddyfile은 호스트 파일과 같은 bind mount다. 토큰 해석은 원본 함수를 그대로 쓴다.
current_caddy_web_upstream_host() {
  local token
  token="$(awk '$1 == "reverse_proxy" && $2 ~ /^(front[-_](blue|green):3000|\{\$WEB_UPSTREAM:front[-_](blue|green)\}:3000)$/ {print $2; exit}' "${CADDY_FILE}")"
  resolve_caddy_web_upstream_token "${token}" || true
}

compose() {
  printf 'compose %s\n' "$*" >> "${STUB_CALL_LOG}"
  case "$1" in
    stop)
      grep -vx "$2" "${STUB_RUNNING_FRONT_FILE}" > "${STUB_RUNNING_FRONT_FILE}.tmp" || true
      mv "${STUB_RUNNING_FRONT_FILE}.tmp" "${STUB_RUNNING_FRONT_FILE}"
      ;;
    up)
      printf '%s\n' "$3" >> "${STUB_RUNNING_FRONT_FILE}"
      ;;
  esac
  return 0
}

compose_up_force_recreate_with_retry() {
  printf 'compose_up_force_recreate %s\n' "$*" >> "${STUB_CALL_LOG}"
  printf '%s\n' "$1" >> "${STUB_RUNNING_FRONT_FILE}"
  return "${STUB_CANDIDATE_BOOT_STATUS:-0}"
}
STUBS

harness_missing_functions() {
  local harness="$1"
  local words="${workdir}/harness-words"
  local defined="${workdir}/harness-defined"

  sed 's/^[[:space:]]*#.*$//' "${harness}" \
    | grep -oE '[A-Za-z_][A-Za-z0-9_]*' | sort -u > "${words}"
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*\(\)' "${harness}" \
    | sed 's/()$//' | sort -u > "${defined}"

  comm -12 "${production_functions}" "${words}" | comm -23 - "${defined}" | tr '\n' ' '
}

# ---------------------------------------------------------------------------
# fixture
# ---------------------------------------------------------------------------

case_dir=""

setup_case() {
  local name="$1"
  local profiles="$2"
  local web_domain="$3"

  case_dir="${workdir}/${name}"
  rm -rf "${case_dir}"
  mkdir -p "${case_dir}/caddy"

  {
    printf 'API_DOMAIN=api.blog.aquilaxk.site\n'
    if [ -n "${profiles}" ]; then
      printf 'COMPOSE_PROFILES=%s\n' "${profiles}"
    fi
    if [ -n "${web_domain}" ]; then
      printf 'WEB_DOMAIN=%s\n' "${web_domain}"
    fi
  } > "${case_dir}/.env.prod"

  # 실제 Caddyfile의 web vhost 토큰을 그대로 옮긴다.
  grep -n 'reverse_proxy {\$WEB_UPSTREAM:front_blue}:3000' "${caddy_source}" >/dev/null \
    || fail "tracked Caddyfile no longer carries the {\$WEB_UPSTREAM:front_blue}:3000 token this test pins"
  {
    printf 'http://{$API_DOMAIN} {\n'
    printf '  handle {\n'
    printf '    reverse_proxy {$ADMIN_API_UPSTREAM:back_blue}:8080\n'
    printf '  }\n'
    printf '}\n'
    printf '\n'
    printf 'http://{$WEB_DOMAIN:web.localhost} {\n'
    printf '  handle {\n'
    printf '    reverse_proxy {$WEB_UPSTREAM:front_blue}:3000\n'
    printf '  }\n'
    printf '}\n'
  } > "${case_dir}/caddy/Caddyfile"

  : > "${case_dir}/running-front"
  : > "${case_dir}/container-images"
  : > "${case_dir}/health"
  : > "${case_dir}/front-http"
  : > "${case_dir}/served-sha"
  : > "${case_dir}/call-log"
}

run_front_case() {
  local body="$1"
  local harness="${case_dir}/harness.sh"

  {
    printf '%s\n' 'set -uo pipefail'
    printf 'ENV_FILE=%q\n' "${case_dir}/.env.prod"
    printf 'CADDY_FILE=%q\n' "${case_dir}/caddy/Caddyfile"
    printf 'CADDY_CONTAINER_FILE=%q\n' "${case_dir}/caddy/Caddyfile"
    printf 'FRONT_STATE_FILE=%q\n' "${case_dir}/.active_front"
    printf 'FRONT_RELEASE_STATE_FILE=%q\n' "${case_dir}/.front-release-state.env"
    printf 'STUB_RUNNING_FRONT_FILE=%q\n' "${case_dir}/running-front"
    printf 'STUB_CONTAINER_IMAGE_FILE=%q\n' "${case_dir}/container-images"
    printf 'STUB_HEALTH_FILE=%q\n' "${case_dir}/health"
    printf 'STUB_FRONT_HTTP_FILE=%q\n' "${case_dir}/front-http"
    printf 'STUB_SERVED_SHA_FILE=%q\n' "${case_dir}/served-sha"
    printf 'STUB_CALL_LOG=%q\n' "${case_dir}/call-log"
    printf '%s\n' 'COMPOSE_PROJECT_NAME=blog_home'
    # resolve_compose_profiles가 참조한다. 비어 있으면 set -u로 죽고, 그 실패가
    # compose_profile_enabled를 false로 흘려 "프로필 꺼짐" 분기로 조용히 통과한다.
    printf '%s\n' 'RUNTIME_SPLIT_ENABLED=false'
    printf '%s\n' 'COMPOSE_PROFILES='
    printf '%s\n' 'APP_NETWORK_NAME=blog_home_app'
    printf '%s\n' 'EDGE_NETWORK_NAME=blog_home_edge'
    printf '%s\n' 'FRONT_LIVENESS_PATH=/robots.txt'
    printf '%s\n' 'FRONT_RENDER_PATH=/'
    printf '%s\n' 'FRONT_HEALTHCHECK_RETRIES=2'
    printf '%s\n' 'FRONT_HEALTHCHECK_INTERVAL_SECONDS=1'
    printf '%s\n' 'FRONT_HEALTHCHECK_CONNECT_TIMEOUT_SECONDS=3'
    printf '%s\n' 'FRONT_HEALTHCHECK_MAX_TIME_SECONDS=20'
    printf '%s\n' 'FRONT_ROUTE_VERIFY_RETRIES=2'
    printf '%s\n' 'FRONT_ROUTE_VERIFY_INTERVAL_SECONDS=1'
    cat "${extracted}"
    cat "${stubs}"
    printf '%s\n' "${body}"
  } > "${harness}"

  local missing
  missing="$(harness_missing_functions "${harness}")"
  if [ -n "${missing}" ]; then
    fail "harness calls production functions that are neither extracted nor stubbed: ${missing}"
  fi

  set +e
  LC_ALL=C bash "${harness}" > "${case_dir}/stdout" 2> "${case_dir}/stderr"
  local status=$?
  set -e

  # 정의되지 않은 함수(127)와 미설정 전역(set -u)은 둘 다 조건문을 false로 흘려 테스트를 조용히
  # 통과시킨다. 실제로 RUNTIME_SPLIT_ENABLED 누락이 "front 프로필 꺼짐" 분기로 새어 케이스 두 개가
  # 잘못된 이유로 green이었다. 두 신호 모두 하네스 오류로 취급한다.
  if grep -qE 'command not found|: not found|unbound variable' "${case_dir}/stderr"; then
    fail "harness hit an undefined command or variable; the assertion below would be vacuous$(printf '\n')$(cat "${case_dir}/stderr")"
  fi

  printf '%s' "${status}"
}

assert_equals() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "${expected}" != "${actual}" ]; then
    fail "${label}: expected '${expected}', got '${actual}'"
  fi
}

# 실패 메시지에 케이스의 stdout/stderr를 함께 싣는다. 이 하네스는 원본 스크립트를 fixture 위에서
# 돌리므로, 어느 단계에서 멈췄는지가 없으면 실패 원인을 파일 내용만으로 추적할 수 없다.
case_diagnostics() {
  printf '\n--- stdout ---\n%s\n--- stderr ---\n%s\n' \
    "$(cat "${case_dir}/stdout" 2>/dev/null || true)" \
    "$(cat "${case_dir}/stderr" 2>/dev/null || true)"
}

assert_file_contains() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  if ! grep -qE "${pattern}" "${file}"; then
    fail "${label}: '${pattern}' not found in ${file}$(printf '\n')$(cat "${file}")$(case_diagnostics)"
  fi
}

assert_file_lacks() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  if grep -qE "${pattern}" "${file}"; then
    fail "${label}: '${pattern}' unexpectedly present in ${file}$(printf '\n')$(cat "${file}")$(case_diagnostics)"
  fi
}

good_image="ghcr.io/aquilaxk/aquila-blog-front@sha256:1111111111111111111111111111111111111111111111111111111111111111"
old_image="ghcr.io/aquilaxk/aquila-blog-front@sha256:2222222222222222222222222222222222222222222222222222222222222222"
new_sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
old_sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

# ---------------------------------------------------------------------------
# 1) front 프로필이 꺼져 있고 WEB_DOMAIN도 없으면 배포할 대상이 없다: 결과를 남기고 0으로 끝난다.
# ---------------------------------------------------------------------------
setup_case "profile-off-no-web-domain" "runtime-split" ""
status="$(run_front_case 'STAGED_FRONT_IMAGE=""; STAGED_FRONT_BUILD_SHA=""; run_front_blue_green_deploy')"
assert_equals "profile off without WEB_DOMAIN must not fail the deploy" "0" "${status}"
assert_file_contains "profile off must report an explicit result" "${case_dir}/stdout" '^front_deploy_result=profile_disabled$'

# ---------------------------------------------------------------------------
# 2) 프로필이 꺼졌는데 WEB_DOMAIN이 공개 트래픽을 받고 있으면 stale front가 서빙 중이라는 뜻이다.
#    그 상태를 성공으로 보고하면 안 된다.
# ---------------------------------------------------------------------------
setup_case "profile-off-with-web-domain" "runtime-split" "blog.aquilaxk.site"
status="$(run_front_case 'STAGED_FRONT_IMAGE=""; STAGED_FRONT_BUILD_SHA=""; run_front_blue_green_deploy')"
assert_equals "profile off while WEB_DOMAIN serves traffic must fail" "1" "${status}"
assert_file_lacks "a failed front deploy must not emit a success marker" "${case_dir}/stdout" '^front_deploy_result='

# ---------------------------------------------------------------------------
# 3) digest가 아닌 이미지 참조와 빈 build sha는 cutover 전에 막힌다.
# ---------------------------------------------------------------------------
setup_case "tag-image-rejected" "runtime-split,front" "blog.aquilaxk.site"
status="$(run_front_case 'STAGED_FRONT_IMAGE="ghcr.io/aquilaxk/aquila-blog-front:sha-'"${new_sha}"'"; STAGED_FRONT_BUILD_SHA="'"${new_sha}"'"; run_front_blue_green_deploy')"
assert_equals "a tag ref must be refused" "1" "${status}"

setup_case "missing-build-sha-rejected" "runtime-split,front" "blog.aquilaxk.site"
status="$(run_front_case 'STAGED_FRONT_IMAGE="'"${good_image}"'"; STAGED_FRONT_BUILD_SHA=""; run_front_blue_green_deploy')"
assert_equals "a missing build sha must be refused" "1" "${status}"
assert_file_lacks "the upstream must stay on the placeholder when the input is refused" "${case_dir}/caddy/Caddyfile" 'reverse_proxy front_green:3000'

# ---------------------------------------------------------------------------
# 4) 후보 health가 통과하지 못하면 트래픽을 넘기지 않는다.
# ---------------------------------------------------------------------------
setup_case "candidate-unhealthy" "runtime-split,front" "blog.aquilaxk.site"
printf 'front_blue\n' > "${case_dir}/running-front"
printf 'front_blue\n' > "${case_dir}/.active_front"
printf 'front_blue=%s\n' "${old_image}" > "${case_dir}/container-images"
printf 'front_blue=healthy\nfront_green=unhealthy\n' > "${case_dir}/health"
printf 'front_blue/robots.txt=200\nfront_blue/=200\nfront_green/robots.txt=200\nfront_green/=500\n' > "${case_dir}/front-http"
printf 'front_blue=%s\nfront_green=%s\n' "${old_sha}" "${new_sha}" > "${case_dir}/served-sha"
status="$(run_front_case 'STAGED_FRONT_IMAGE="'"${good_image}"'"; STAGED_FRONT_BUILD_SHA="'"${new_sha}"'"; run_front_blue_green_deploy')"
assert_equals "an unhealthy candidate must fail the front deploy" "1" "${status}"
assert_file_lacks "an unhealthy candidate must never receive the edge upstream" "${case_dir}/caddy/Caddyfile" 'reverse_proxy front_green:3000'
assert_file_contains "WEB_UPSTREAM must stay pinned to the live colour" "${case_dir}/.env.prod" '^WEB_UPSTREAM=front_blue$'
assert_file_contains "the failed candidate must be stopped" "${case_dir}/call-log" '^compose stop front_green$'
assert_file_lacks "a failed front deploy must not emit a success marker" "${case_dir}/stdout" '^front_deploy_result='

# ---------------------------------------------------------------------------
# 5) 렌더 경로가 200이어도 edge가 기대한 빌드를 서빙하지 않으면 rollback한다. rollback은 이전
#    색과 이전 빌드까지 복구해야 하고, 배포 자체는 실패로 끝나야 한다.
# ---------------------------------------------------------------------------
setup_case "served-build-mismatch" "runtime-split,front" "blog.aquilaxk.site"
printf 'front_blue\n' > "${case_dir}/running-front"
printf 'front_blue\n' > "${case_dir}/.active_front"
printf 'front_blue=%s\n' "${old_image}" > "${case_dir}/container-images"
printf 'front_blue=healthy\nfront_green=healthy\n' > "${case_dir}/health"
printf 'front_blue/robots.txt=200\nfront_blue/=200\nfront_green/robots.txt=200\nfront_green/=200\n' > "${case_dir}/front-http"
# green은 뜨지만 edge에서 관측되는 빌드는 여전히 예전 것이다(예: 캐시된 라우팅, 잘못된 digest).
printf 'front_blue=%s\nfront_green=%s\n' "${old_sha}" "${old_sha}" > "${case_dir}/served-sha"
status="$(run_front_case 'STAGED_FRONT_IMAGE="'"${good_image}"'"; STAGED_FRONT_BUILD_SHA="'"${new_sha}"'"; run_front_blue_green_deploy')"
assert_equals "a served build mismatch must fail the front deploy" "1" "${status}"
assert_file_contains "rollback must put the edge back on the previous colour" "${case_dir}/caddy/Caddyfile" 'reverse_proxy front_blue:3000'
assert_file_contains "rollback must repin WEB_UPSTREAM" "${case_dir}/.env.prod" '^WEB_UPSTREAM=front_blue$'
assert_file_contains "rollback must leave the previous digest as evidence" "${case_dir}/.front-release-state.env" "^front_active_image=${old_image}$"
assert_file_contains "rollback must record the rollback result" "${case_dir}/.front-release-state.env" '^front_result=rolled_back$'
assert_file_contains "rollback must record the reason" "${case_dir}/.front-release-state.env" '^front_reason=front_served_build_sha_mismatch$'
assert_file_contains "rollback must record when the edge was switched back" "${case_dir}/.front-release-state.env" '^front_switched_at=[0-9]{4}-[0-9]{2}-[0-9]{2}T'
assert_file_contains "rollback must record the build the edge serves again" "${case_dir}/.front-release-state.env" "^front_active_build_sha=${old_sha}$"
assert_file_contains "the failed candidate must be stopped after rollback" "${case_dir}/call-log" '^compose stop front_green$'
assert_file_lacks "a rolled back front deploy must not emit a success marker" "${case_dir}/stdout" '^front_deploy_result='

# ---------------------------------------------------------------------------
# 6) 정상 cutover: 후보가 health를 통과하고 edge가 그 빌드를 서빙하면 전환이 확정된다.
# ---------------------------------------------------------------------------
setup_case "successful-cutover" "runtime-split,front" "blog.aquilaxk.site"
printf 'front_blue\n' > "${case_dir}/running-front"
printf 'front_blue\n' > "${case_dir}/.active_front"
printf 'front_blue=%s\n' "${old_image}" > "${case_dir}/container-images"
printf 'front_blue=healthy\nfront_green=healthy\n' > "${case_dir}/health"
printf 'front_blue/robots.txt=200\nfront_blue/=200\nfront_green/robots.txt=200\nfront_green/=200\n' > "${case_dir}/front-http"
printf 'front_blue=%s\nfront_green=%s\n' "${old_sha}" "${new_sha}" > "${case_dir}/served-sha"
status="$(run_front_case 'STAGED_FRONT_IMAGE="'"${good_image}"'"; STAGED_FRONT_BUILD_SHA="'"${new_sha}"'"; run_front_blue_green_deploy')"
assert_equals "a verified cutover must succeed" "0" "${status}"
assert_file_contains "the edge must move to the new colour" "${case_dir}/caddy/Caddyfile" 'reverse_proxy front_green:3000'
assert_file_contains "WEB_UPSTREAM must follow the cutover" "${case_dir}/.env.prod" '^WEB_UPSTREAM=front_green$'
assert_file_contains "the new colour must own the staged digest" "${case_dir}/.env.prod" "^FRONT_GREEN_IMAGE=${good_image}$"
assert_file_contains "the previous colour must keep its digest for rollback" "${case_dir}/.env.prod" "^FRONT_BLUE_IMAGE=${old_image}$"
assert_equals "the active colour state file must follow the cutover" "front_green" "$(cat "${case_dir}/.active_front")"
assert_file_contains "the previous digest must stay recorded as rollback evidence" "${case_dir}/.front-release-state.env" "^front_previous_image=${old_image}$"
assert_file_contains "the deploy must record the served build" "${case_dir}/.front-release-state.env" "^front_active_build_sha=${new_sha}$"
# 이전 색은 warm rollback 대상이라 정지시키지 않는다. 정지시키면 다음 실패의 rollback이 cold
# boot를 기다리는 동안 공개 사이트가 깨진 빌드에 머문다.
assert_file_lacks "the previous colour must stay warm as the rollback target" "${case_dir}/call-log" '^compose stop front_blue$'
assert_file_contains "a verified cutover must report its result" "${case_dir}/stdout" '^front_deploy_result=deployed$'

# ---------------------------------------------------------------------------
# 7) backend 배포 경로: front 이미지 키가 사라져도 실행 중인 컨테이너에서 복원하고, WEB_UPSTREAM을
#    활성 색으로 다시 핀한다. 이게 없으면 backend 배포만으로 공개 트래픽이 멈춘 색으로 넘어간다.
# ---------------------------------------------------------------------------
setup_case "backend-path-preserves-front" "runtime-split,front" "blog.aquilaxk.site"
printf 'front_green\n' > "${case_dir}/running-front"
printf 'front_green\n' > "${case_dir}/.active_front"
printf 'front_blue=%s\nfront_green=%s\n' "${old_image}" "${good_image}" > "${case_dir}/container-images"
status="$(run_front_case 'prepare_front_runtime_images && persist_front_caddy_upstream')"
assert_equals "the backend path must recover the front image map" "0" "${status}"
assert_file_contains "blue must be restored from its container" "${case_dir}/.env.prod" "^FRONT_BLUE_IMAGE=${old_image}$"
assert_file_contains "green must be restored from its container" "${case_dir}/.env.prod" "^FRONT_GREEN_IMAGE=${good_image}$"
assert_file_contains "WEB_UPSTREAM must be repinned to the active colour" "${case_dir}/.env.prod" '^WEB_UPSTREAM=front_green$'

# ---------------------------------------------------------------------------
# 8) 프로필이 켜졌는데 어느 색에서도 이미지를 찾을 수 없으면 compose 평가가 깨진다. 그 전에 멈춘다.
# ---------------------------------------------------------------------------
setup_case "front-image-unresolvable" "runtime-split,front" "blog.aquilaxk.site"
status="$(run_front_case 'prepare_front_runtime_images')"
assert_equals "an unresolvable front image must stop the deploy" "1" "${status}"

# ---------------------------------------------------------------------------
# 9) 두 색이 모두 멈춘 구간에서도 마지막으로 검증된 색을 기억해야 한다. front_blue로 되돌리면
#    backend 배포가 WEB_UPSTREAM을 반대 색으로 고정한다.
# ---------------------------------------------------------------------------
setup_case "detect-active-front-from-state" "runtime-split,front" "blog.aquilaxk.site"
printf 'front_green\n' > "${case_dir}/.active_front"
status="$(run_front_case 'detect_active_front')"
assert_equals "detect_active_front must not fail" "0" "${status}"
assert_equals "a stopped-but-recorded colour must win over the blue default" "front_green" "$(cat "${case_dir}/stdout")"

echo "[test] front blue/green cutover contract: PASS"
