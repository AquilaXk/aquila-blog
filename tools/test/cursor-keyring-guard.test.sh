#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
guard="${repo_root}/deploy/homeserver/cursor_keyring_guard.sh"
precheck="${repo_root}/deploy/homeserver/post_precheck_env_guard.sh"
rollback="${repo_root}/deploy/homeserver/rollback_last_deploy.sh"
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

fail() { echo "[test] $1" >&2; exit 1; }

if [[ ! -x "${guard}" ]]; then
  fail "cursor keyring guard must be executable"
fi
if ! grep -qF '"${CURSOR_KEYRING_GUARD}" "${ENV_FILE}"' "${precheck}"; then
  fail "post-precheck must invoke the cursor keyring guard"
fi
if ! grep -qF 'cursor_keyring_guard.sh" "${SCRIPT_DIR}/.env.prod"' "${rollback}"; then
  fail "rollback must validate the live env keyring"
fi
guard_line="$(grep -nF 'cursor_keyring_guard.sh" "${SCRIPT_DIR}/.env.prod"' "${rollback}" | head -n 1 | cut -d: -f1)"
compose_line="$(grep -nF 'compose_up_with_retry' "${rollback}" | tail -n 1 | cut -d: -f1)"
(( guard_line < compose_line )) || fail "rollback must validate the keyring before compose/recreate"

valid_env="${workdir}/valid.env"
now_epoch="$(date +%s)"
valid_expiry="$((now_epoch + 3600))"
expired_expiry="$((now_epoch - 1))"
over_window_expiry="$((now_epoch + 172800))"
printf '%s\n' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET=cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION=2' \
  'PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET=cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345' \
  'PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION=1' \
  "PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS=${valid_expiry}" > "${valid_env}"

output="$("${guard}" "${valid_env}")" || fail "valid keyring must pass"
[[ "${output}" == *"current_version=2"* && "${output}" == *"previous_present=true"* ]] || fail "guard must emit only safe identity"
if [[ "${output}" == *"cursor-signing-"* ]]; then
  fail "guard output must never expose a key"
fi

# validate-env.mjs의 parseEnvText와 동일하게 leading whitespace, optional export,
# assignment whitespace, 한 겹 quote, CRLF, 마지막 대입을 모두 허용해야 한다.
syntax_env="${workdir}/syntax.env"
printf '%s\r\n' \
  ' export PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET = "change_me_cursor_key"' \
  ' export PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET = "cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345"' \
  ' PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION = "2"' \
  ' export PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET = "cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345"' \
  ' PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION = "1"' \
  " export PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS = \"${valid_expiry}\"" > "${syntax_env}"
"${guard}" "${syntax_env}" >/dev/null || fail "Node-compatible quoted/export/whitespace/CRLF keyring must pass"

embedded_marker_env="${workdir}/embedded-marker.env"
printf '%s\n' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET=prefix-change_me-marker-abcdefghijklmnopqrstuvwxyz012345' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION=2' > "${embedded_marker_env}"
"${guard}" "${embedded_marker_env}" >/dev/null || fail "embedded placeholder marker must remain valid under the anchored contract pattern"

printf '%s\r\n' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET=old-value-abcdefghijklmnopqrstuvwxyz0123456789' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET=cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345' \
  'PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION=2' > "${workdir}/crlf.env"
"${guard}" "${workdir}/crlf.env" >/dev/null || fail "last CRLF assignment must be used"

for fixture in missing-version placeholder example-domain edge-whitespace previous-partial same-secret expired over-window huge-version huge-expiry; do
  cp "${valid_env}" "${workdir}/${fixture}.env"
done
replace_fixture() { sed "s|$2|$3|" "$1" > "$1.tmp" && mv "$1.tmp" "$1"; }
remove_fixture_line() { sed "/$2/d" "$1" > "$1.tmp" && mv "$1.tmp" "$1"; }
remove_fixture_line "${workdir}/missing-version.env" 'CURSOR_SIGNING_KEY_VERSION=2'
replace_fixture "${workdir}/placeholder.env" 'cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345' 'change_me_cursor_key'
replace_fixture "${workdir}/example-domain.env" 'cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345' 'cursor-signing-secret.example.com'
replace_fixture "${workdir}/edge-whitespace.env" 'CURSOR_SIGNING_SECRET=cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345' 'CURSOR_SIGNING_SECRET=" cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345 "'
remove_fixture_line "${workdir}/previous-partial.env" 'PREVIOUS_SIGNING_KEY_VERSION=1'
replace_fixture "${workdir}/same-secret.env" 'cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345' 'cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345'
replace_fixture "${workdir}/expired.env" "${valid_expiry}" "${expired_expiry}"
replace_fixture "${workdir}/over-window.env" "${valid_expiry}" "${over_window_expiry}"
replace_fixture "${workdir}/huge-version.env" 'CURSOR_SIGNING_KEY_VERSION=2' 'CURSOR_SIGNING_KEY_VERSION=9223372036854775808'
replace_fixture "${workdir}/huge-expiry.env" "${valid_expiry}" '9223372036854775808'

for fixture in missing-version placeholder example-domain edge-whitespace previous-partial same-secret expired over-window huge-version huge-expiry; do
  set +e
  failure_output="$("${guard}" "${workdir}/${fixture}.env" 2>&1)"
  status=$?
  set -e
  [[ ${status} -ne 0 ]] || fail "${fixture} must fail closed"
  [[ "${failure_output}" != *"cursor-signing-"* ]] || fail "${fixture} failure exposed a key"
done
