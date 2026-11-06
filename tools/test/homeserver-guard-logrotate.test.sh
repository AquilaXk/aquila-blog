#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
cd "${repo_root}"

guard_script="deploy/homeserver/steady_state_guard.sh"
if [ ! -f "${guard_script}" ]; then
  echo "[test] ${guard_script} is missing from the repository checkout" >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

fail() {
  echo "[test] $1" >&2
  exit 1
}

extract_function() {
  awk -v head="$1() {" '
    index($0, head) == 1 { capture = 1 }
    capture { print }
    capture && $0 == "}" { exit }
  ' "${guard_script}"
}

eval "$(extract_function rotate_guard_log)"

# Test 1: Log file smaller than max_bytes is not rotated
test_log="${workdir}/guard.log"
printf 'small log content\n' > "${test_log}"
LOG_FILE="${test_log}" STEADY_GUARD_LOG_MAX_BYTES=100 STEADY_GUARD_LOG_KEEP_FILES=3 rotate_guard_log
[[ -f "${test_log}" ]] || fail "test_log should still exist"
[[ $(wc -c < "${test_log}") -gt 0 ]] || fail "test_log should not be truncated"
[[ ! -f "${test_log}.1.gz" ]] || fail "test_log.1.gz should not exist"

# Test 2: Log file exceeding max_bytes is truncated and compressed to .1.gz
python3 -c "print('A' * 200)" > "${test_log}"
LOG_FILE="${test_log}" STEADY_GUARD_LOG_MAX_BYTES=100 STEADY_GUARD_LOG_KEEP_FILES=3 rotate_guard_log
[[ $(wc -c < "${test_log}") -eq 0 ]] || fail "test_log should be truncated to 0"
[[ -f "${test_log}.1.gz" ]] || fail "test_log.1.gz should exist"

# Test 3: Multiple rotations cascade .1.gz -> .2.gz -> .3.gz
python3 -c "print('B' * 200)" > "${test_log}"
LOG_FILE="${test_log}" STEADY_GUARD_LOG_MAX_BYTES=100 STEADY_GUARD_LOG_KEEP_FILES=3 rotate_guard_log
[[ -f "${test_log}.1.gz" ]] && [[ -f "${test_log}.2.gz" ]] || fail "test_log.1.gz and .2.gz should exist"

python3 -c "print('C' * 200)" > "${test_log}"
LOG_FILE="${test_log}" STEADY_GUARD_LOG_MAX_BYTES=100 STEADY_GUARD_LOG_KEEP_FILES=3 rotate_guard_log
[[ -f "${test_log}.1.gz" ]] && [[ -f "${test_log}.2.gz" ]] && [[ -f "${test_log}.3.gz" ]] || fail "test_log.1.gz, .2.gz, and .3.gz should exist"

# Test 4: Files exceeding keep_files (3) are pruned
python3 -c "print('D' * 200)" > "${test_log}"
LOG_FILE="${test_log}" STEADY_GUARD_LOG_MAX_BYTES=100 STEADY_GUARD_LOG_KEEP_FILES=3 rotate_guard_log
[[ -f "${test_log}.1.gz" ]] && [[ -f "${test_log}.2.gz" ]] && [[ -f "${test_log}.3.gz" ]] || fail "1, 2, 3 should exist"
[[ ! -f "${test_log}.4.gz" ]] || fail "test_log.4.gz should have been pruned"

# Test 5: Verify contents of compressed archive
gunzip -c "${test_log}.1.gz" | grep -q 'D' || fail "most recent archive .1.gz should contain D"
gunzip -c "${test_log}.2.gz" | grep -q 'C' || fail "archive .2.gz should contain C"
gunzip -c "${test_log}.3.gz" | grep -q 'B' || fail "archive .3.gz should contain B"

# Test 6: Non-existent file gracefully returns 0
LOG_FILE="${workdir}/nonexistent.log" rotate_guard_log || fail "nonexistent file should return 0"

# Test 7: Handles uncompressed log files gracefully
test_uncompressed="${workdir}/uncompressed.log"
printf 'initial' > "${test_uncompressed}.1"
python3 -c "print('X' * 200)" > "${test_uncompressed}"
LOG_FILE="${test_uncompressed}" STEADY_GUARD_LOG_MAX_BYTES=100 STEADY_GUARD_LOG_KEEP_FILES=3 rotate_guard_log
[[ -f "${test_uncompressed}.2" ]] || fail "test_uncompressed.1 should have shifted to .2"
[[ -f "${test_uncompressed}.1.gz" ]] || fail "new archive should be .1.gz"

eval "$(extract_function materialized_service_env_ready)"
eval "$(extract_function compose)"
eval "$(extract_function is_protected_http_status)"
eval "$(extract_function probe_internal_caddy_route_metrics)"
eval "$(extract_function probe_grafana_core_datasources)"

SCRIPT_DIR="${workdir}/guard-runtime"
mkdir -p "${SCRIPT_DIR}/.web-metrics-credentials/runtime"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
NETWORK_NAME="blog_home_edge"
printf 'WEB_DOMAIN=blog.example.com\n' > "${ENV_FILE}"
printf 'services: {}\n' > "${COMPOSE_FILE}"

materialize_log="${workdir}/materialize.log"
docker_log="${workdir}/docker.log"
cat > "${SCRIPT_DIR}/materialize_service_env.sh" <<EOF
#!/usr/bin/env bash
printf 'materialized\n' >> "${materialize_log}"
touch "${SCRIPT_DIR}/.env.caddy.prod" "${SCRIPT_DIR}/.env.back.prod" "${SCRIPT_DIR}/.env.front.prod" "${SCRIPT_DIR}/.env.front.metrics.prod" "${SCRIPT_DIR}/.web-metrics-credentials/runtime/web-metrics-token"
EOF
chmod +x "${SCRIPT_DIR}/materialize_service_env.sh"

docker() {
  printf '%s\n' "$*" >> "${docker_log}"
  return 0
}

compose ps >/dev/null
[[ $(wc -l < "${materialize_log}" | tr -d ' ') -eq 1 ]] || fail "compose ps should materialize missing service env files once"

compose ps >/dev/null
[[ $(wc -l < "${materialize_log}" | tr -d ' ') -eq 1 ]] || fail "compose ps should skip materialize when service env files are ready"

touch -t 202001010000 "${SCRIPT_DIR}/.env.front.prod"
compose ps >/dev/null
[[ $(wc -l < "${materialize_log}" | tr -d ' ') -eq 2 ]] || fail "compose ps should rematerialize when any service env file is older than .env.prod"

compose up -d caddy >/dev/null
[[ $(wc -l < "${materialize_log}" | tr -d ' ') -eq 3 ]] || fail "compose up should always materialize service env files"

curl() {
  printf '200 15'
}
: > "${docker_log}"
metrics_out="$(probe_internal_caddy_route_metrics "blog.example.com" "/actuator/health/readiness")"
[[ "${metrics_out}" == "200 15" ]] || fail "expected host curl fast path to return 200 15"
[[ ! -s "${docker_log}" ]] || fail "expected host curl fast path not to spawn docker run"

curl() {
  printf '000 0'
}
docker() {
  printf '%s\n' "$*" >> "${docker_log}"
  printf '200 42'
}
metrics_fallback="$(probe_internal_caddy_route_metrics "blog.example.com" "/actuator/health/readiness")"
[[ "${metrics_fallback}" == "200 42" ]] || fail "expected docker fallback to return 200 42"
[[ -s "${docker_log}" ]] || fail "expected unreachable host curl to fall back to docker run"

reset_calls=0
reset_grafana_admin_password() {
  reset_calls=$(( reset_calls + 1 ))
}
query_grafana_datasource_by_uid() {
  printf '200'
  return 0
}
probe_grafana_core_datasources "admin" "pw" || fail "expected healthy datasources to pass"
[[ "${reset_calls}" -eq 0 ]] || fail "expected 200 OK datasources not to reset grafana admin password"

query_grafana_datasource_by_uid() {
  printf '000'
  return 1
}
if probe_grafana_core_datasources "admin" "pw"; then
  fail "expected unreachable datasources to fail"
fi
[[ "${reset_calls}" -eq 0 ]] || fail "expected unreachable datasources (000) not to reset grafana admin password"

auth_fixed="false"
reset_grafana_admin_password() {
  reset_calls=$(( reset_calls + 1 ))
  auth_fixed="true"
}
query_grafana_datasource_by_uid() {
  if [[ "${auth_fixed}" != "true" ]]; then
    printf '401'
    return 1
  fi
  printf '200'
  return 0
}
probe_grafana_core_datasources "admin" "pw" || fail "expected 401 datasources to recover after password reset"
[[ "${reset_calls}" -eq 1 ]] || fail "expected 401 datasource response to trigger exactly one password reset"

cron_bin_dir="${workdir}/cron-bin"
cron_store="${workdir}/crontab.store"
mkdir -p "${cron_bin_dir}"
printf '0 3 * * * /usr/local/bin/backup.sh\n* * * * * cd /old && /old/steady_state_guard.sh >> /old/.steady-state-guard.log 2>&1\n' > "${cron_store}"
cat > "${cron_bin_dir}/crontab" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-l" ]]; then
  cat "${cron_store}"
  exit 0
fi
cp "\$1" "${cron_store}"
EOF
chmod +x "${cron_bin_dir}/crontab"

PATH="${cron_bin_dir}:${PATH}" bash "deploy/homeserver/install_steady_state_guard_cron.sh" >/dev/null
grep -Fq '0 3 * * * /usr/local/bin/backup.sh' "${cron_store}" || fail "expected unrelated crontab entries to be preserved"
! grep -Fq '* * * * * cd /old' "${cron_store}" || fail "expected legacy 1-minute steady_state_guard entry to be removed"
grep -Fq "*/5 * * * * cd ${repo_root}/deploy/homeserver && ${repo_root}/deploy/homeserver/steady_state_guard.sh >> ${repo_root}/deploy/homeserver/.steady-state-guard.log 2>&1" "${cron_store}" || fail "expected 5-minute steady_state_guard crontab entry to be installed"

echo "[test] homeserver guard logrotate rules passed"
