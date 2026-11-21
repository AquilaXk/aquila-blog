#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.prod}"
NOW_EPOCH_SECONDS="$(date +%s)"
MAX_SIGNED_LONG="9223372036854775807"

fail() {
  echo "[CURSOR_KEYRING_INVALID] $1" >&2
  exit 1
}

env_value() {
  local key="$1"
  awk -v key="${key}" '
    {
      line = $0
      sub(/\r$/, "", line)
      assignment = "^[[:space:]]*(export[[:space:]]+)?" key "[[:space:]]*="
      if (line ~ assignment) {
        value = line
        sub(assignment, "", value)
        sub(/^[[:space:]]+/, "", value)
        sub(/[[:space:]]+$/, "", value)
        quote = substr(value, 1, 1)
        if ((quote == "\"" || quote == "\047") && substr(value, length(value), 1) == quote) {
          value = substr(value, 2, length(value) - 2)
        }
        found = value
      }
    }
    END { printf "%s", found }
  ' "${ENV_FILE}"
}

is_canonical_positive_decimal() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

decimal_less_than() {
  local left="$1" right="$2"
  if (( ${#left} != ${#right} )); then
    (( ${#left} < ${#right} ))
    return
  fi
  [[ "${left}" < "${right}" ]]
}

is_bounded_positive_decimal() {
  local value="$1"
  is_canonical_positive_decimal "${value}" && { decimal_less_than "${value}" "${MAX_SIGNED_LONG}" || [[ "${value}" == "${MAX_SIGNED_LONG}" ]]; }
}

is_placeholder() {
  local value="$1"
  shopt -s nocasematch
  [[ "${value}" =~ ^(NEED_TO|EMPTY$|change_me|change-me|.*example\.com$|https://www\.example\.com|https://api\.example\.com|smtp\.example\.com|.*\<[^\>]+\>.*|.*sha-\<[^\>]+\>.*) ]]
}

[[ -f "${ENV_FILE}" ]] || fail "env_file_missing"
is_bounded_positive_decimal "${NOW_EPOCH_SECONDS}" || fail "invalid_live_clock"

current_secret="$(env_value "PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET")"
current_version="$(env_value "PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION")"
previous_secret="$(env_value "PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET")"
previous_version="$(env_value "PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION")"
previous_expiry="$(env_value "PROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS")"

[[ -n "${current_secret}" ]] || fail "current_secret_missing"
[[ ! "${current_secret}" =~ ^[[:space:]] && ! "${current_secret}" =~ [[:space:]]$ ]] || fail "current_secret_has_edge_whitespace"
(( ${#current_secret} >= 32 )) || fail "current_secret_too_short"
is_placeholder "${current_secret}" && fail "current_secret_placeholder"
is_bounded_positive_decimal "${current_version}" || fail "current_version_invalid"

previous_present="false"
if [[ -n "${previous_secret}${previous_version}${previous_expiry}" ]]; then
  previous_present="true"
  [[ -n "${previous_secret}" && -n "${previous_version}" && -n "${previous_expiry}" ]] || fail "previous_keyring_incomplete"
  [[ ! "${previous_secret}" =~ ^[[:space:]] && ! "${previous_secret}" =~ [[:space:]]$ ]] || fail "previous_secret_has_edge_whitespace"
  (( ${#previous_secret} >= 32 )) || fail "previous_secret_too_short"
  is_placeholder "${previous_secret}" && fail "previous_secret_placeholder"
  [[ "${previous_secret}" != "${current_secret}" ]] || fail "previous_secret_matches_current"
  is_bounded_positive_decimal "${previous_version}" || fail "previous_version_invalid"
  decimal_less_than "${previous_version}" "${current_version}" || fail "previous_version_not_lower"
  is_bounded_positive_decimal "${previous_expiry}" || fail "previous_expiry_invalid"
  decimal_less_than "${NOW_EPOCH_SECONDS}" "${previous_expiry}" || fail "previous_expiry_not_future"
  maximum_expiry="$((NOW_EPOCH_SECONDS + 86400))"
  decimal_less_than "${maximum_expiry}" "${previous_expiry}" && fail "previous_expiry_exceeds_maximum"
fi

echo "[CURSOR_KEYRING_VALID] current_version=${current_version} previous_present=${previous_present} previous_version=${previous_version:-none} previous_expiry=${previous_expiry:-none}"
