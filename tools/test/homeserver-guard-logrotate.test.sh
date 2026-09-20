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

echo "[test] homeserver guard logrotate rules passed"
