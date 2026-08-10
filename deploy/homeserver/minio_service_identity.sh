#!/usr/bin/env bash

set -euo pipefail
exec </dev/null
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
POLICY_TEMPLATE="${SCRIPT_DIR}/minio-app-policy.template.json"
POLICY_VERIFIER="${REPO_ROOT}/tools/env/verify-minio-access-key-info.mjs"
MODE="${1:-}"
ENV_FILE="${2:-${SCRIPT_DIR}/.env.prod}"
DOCKER_NETWORK="${3:-}"
CREDENTIAL_OUTPUT="${4:-}"
declare -a AUDIT_PROBE_OBJECTS=()

fail() {
  echo "[MINIO_SERVICE_IDENTITY_INVALID] $1" >&2
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

is_digest_image() {
  [[ "$1" =~ ^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$ ]] &&
    [[ "$1" != *":latest" && "$1" != *":latest@"* ]]
}

is_canonical_positive_long() {
  local value="$1"
  [[ "${value}" =~ ^[1-9][0-9]*$ ]] || return 1
  if (( ${#value} < 19 )); then
    return 0
  fi
  if (( ${#value} > 19 )); then
    return 1
  fi
  [[ "${value}" < "9223372036854775807" || "${value}" == "9223372036854775807" ]]
}

is_mc_host_secret() {
  [[ "$1" =~ ^[-A-Za-z0-9+/_~.=]+$ ]]
}

write_mc_host_env() {
  local output_file="$1"
  local alias="$2"
  local access_key="$3"
  local secret_key="$4"
  local endpoint="$5"
  local scheme authority
  if [[ ! "${endpoint}" =~ ^(https?)://([^/@]+)$ ]]; then
    fail "storage_endpoint_invalid"
  fi
  scheme="${BASH_REMATCH[1]}"
  authority="${BASH_REMATCH[2]}"
  printf 'MC_HOST_%s=%s://%s:%s@%s\n' \
    "${alias}" \
    "${scheme}" \
    "${access_key}" \
    "${secret_key}" \
    "${authority}" > "${output_file}"
  chmod 600 "${output_file}"
}

compact_json_file() {
  tr -d '[:space:]' < "$1"
}

remove_rotation_metadata() {
  local temporary="${ENV_FILE}.rotation-finalize.$$"
  awk '
    {
      line = $0
      trimmed = line
      sub(/^[[:space:]]+/, "", trimmed)
      sub(/^(export[[:space:]]+)?CUSTOM_STORAGE_PREVIOUS_ACCESSKEY[[:space:]]*=.*/, "", trimmed)
      if (trimmed == "") next
      trimmed = line
      sub(/^[[:space:]]+/, "", trimmed)
      sub(/^(export[[:space:]]+)?CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION[[:space:]]*=.*/, "", trimmed)
      if (trimmed == "") next
      trimmed = line
      sub(/^[[:space:]]+/, "", trimmed)
      sub(/^(export[[:space:]]+)?CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS[[:space:]]*=.*/, "", trimmed)
      if (trimmed == "") next
      print line
    }
  ' "${ENV_FILE}" > "${temporary}"
  chmod 600 "${temporary}"
  mv "${temporary}" "${ENV_FILE}"
}

validate_inputs() {
  [[ -f "${ENV_FILE}" ]] || fail "env_file_missing"
  [[ -n "${DOCKER_NETWORK}" ]] || fail "docker_network_missing"
  docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1 || fail "docker_network_missing"
  [[ -f "${POLICY_TEMPLATE}" ]] || fail "policy_template_missing"
  [[ -f "${POLICY_VERIFIER}" ]] || fail "policy_verifier_missing"

  MINIO_MC_IMAGE="$(env_value "MINIO_MC_IMAGE")"
  NODE_RUNTIME_IMAGE="$(env_value "NODE_RUNTIME_IMAGE")"
  ROOT_ACCESS_KEY="$(env_value "MINIO_ROOT_USER")"
  ROOT_SECRET_KEY="$(env_value "MINIO_ROOT_PASSWORD")"
  STORAGE_ENDPOINT="$(env_value "CUSTOM_STORAGE_ENDPOINT")"
  STORAGE_BUCKET="$(env_value "CUSTOM_STORAGE_BUCKET")"
  POST_PREFIX="$(env_value "CUSTOM_STORAGE_KEYPREFIX")"
  CLOUD_PREFIX="$(env_value "CUSTOM_STORAGE_CLOUD_KEY_PREFIX")"
  CURRENT_ACCESS_KEY="$(env_value "CUSTOM_STORAGE_ACCESSKEY")"
  CURRENT_SECRET_KEY="$(env_value "CUSTOM_STORAGE_SECRETKEY")"
  CURRENT_VERSION="$(env_value "CUSTOM_STORAGE_CREDENTIAL_VERSION")"
  PREVIOUS_ACCESS_KEY="$(env_value "CUSTOM_STORAGE_PREVIOUS_ACCESSKEY")"
  PREVIOUS_VERSION="$(env_value "CUSTOM_STORAGE_PREVIOUS_CREDENTIAL_VERSION")"
  ROTATION_STARTED_AT="$(env_value "CUSTOM_STORAGE_ROTATION_STARTED_AT_EPOCH_SECONDS")"

  is_digest_image "${MINIO_MC_IMAGE}" || fail "mc_image_invalid"
  [[ "${MINIO_MC_IMAGE}" == "minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727" ]] ||
    fail "mc_image_not_approved"
  is_digest_image "${NODE_RUNTIME_IMAGE}" || fail "node_runtime_image_invalid"
  [[ -n "${ROOT_ACCESS_KEY}" && -n "${ROOT_SECRET_KEY}" ]] || fail "root_identity_missing"
  [[ "${ROOT_ACCESS_KEY}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$ ]] || fail "root_access_key_invalid"
  is_mc_host_secret "${ROOT_SECRET_KEY}" || fail "root_secret_not_mc_host_safe"
  [[ "${STORAGE_BUCKET}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || fail "storage_bucket_invalid"
  [[ "${STORAGE_BUCKET}" != *".."* ]] || fail "storage_bucket_invalid"
  [[ "${POST_PREFIX}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "${POST_PREFIX}" != */ && "${POST_PREFIX}" != *".."* ]] ||
    fail "post_prefix_invalid"
  [[ "${CLOUD_PREFIX}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ && "${CLOUD_PREFIX}" != */ && "${CLOUD_PREFIX}" != *".."* ]] ||
    fail "cloud_prefix_invalid"
  [[ "${POST_PREFIX}" != "${CLOUD_PREFIX}" && "${POST_PREFIX}" != "${CLOUD_PREFIX}/"* && "${CLOUD_PREFIX}" != "${POST_PREFIX}/"* ]] ||
    fail "storage_prefix_overlap"

  if [[ "${MODE}" == "wait" || "${MODE}" == "create-rotation" ]]; then
    return 0
  fi
  [[ "${CURRENT_ACCESS_KEY}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$ ]] || fail "current_access_key_invalid"
  (( ${#CURRENT_SECRET_KEY} >= 8 && ${#CURRENT_SECRET_KEY} <= 40 )) || fail "current_secret_key_invalid"
  is_mc_host_secret "${CURRENT_SECRET_KEY}" || fail "current_secret_not_mc_host_safe"
  is_canonical_positive_long "${CURRENT_VERSION}" || fail "current_version_invalid"
  [[ "${CURRENT_ACCESS_KEY}" != "${ROOT_ACCESS_KEY}" ]] || fail "current_access_key_matches_root"
  [[ "${CURRENT_SECRET_KEY}" != "${ROOT_SECRET_KEY}" ]] || fail "current_secret_key_matches_root"

  local previous_count=0
  [[ -n "${PREVIOUS_ACCESS_KEY}" ]] && previous_count=$((previous_count + 1))
  [[ -n "${PREVIOUS_VERSION}" ]] && previous_count=$((previous_count + 1))
  [[ -n "${ROTATION_STARTED_AT}" ]] && previous_count=$((previous_count + 1))
  [[ "${previous_count}" -eq 0 || "${previous_count}" -eq 3 ]] || fail "previous_identity_incomplete"
  if [[ "${previous_count}" -eq 3 ]]; then
    [[ "${PREVIOUS_ACCESS_KEY}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$ ]] || fail "previous_access_key_invalid"
    is_canonical_positive_long "${PREVIOUS_VERSION}" || fail "previous_version_invalid"
    is_canonical_positive_long "${ROTATION_STARTED_AT}" || fail "rotation_started_at_invalid"
  fi
}

render_policy() {
  sed \
    -e "s|{{BUCKET}}|${STORAGE_BUCKET}|g" \
    -e "s|{{POST_PREFIX}}|${POST_PREFIX}|g" \
    -e "s|{{CLOUD_PREFIX}}|${CLOUD_PREFIX}|g" \
    "${POLICY_TEMPLATE}" > "${POLICY_FILE}"
  chmod 600 "${POLICY_FILE}"
  [[ "$(compact_json_file "${POLICY_FILE}")" != *"{{"* ]] || fail "policy_placeholder_unresolved"
}

prepare_files() {
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/aquila-minio-identity.XXXXXX")"
  ADMIN_ENV_FILE="${WORKDIR}/admin.env"
  APP_ENV_FILE="${WORKDIR}/app.env"
  POLICY_FILE="${WORKDIR}/policy.json"
  INFO_FILE="${WORKDIR}/info.json"
  ERROR_FILE="${WORKDIR}/error.json"
  trap cleanup_identity_workdir EXIT INT TERM

  write_mc_host_env "${ADMIN_ENV_FILE}" "admin" "${ROOT_ACCESS_KEY}" "${ROOT_SECRET_KEY}" "${STORAGE_ENDPOINT}"
  write_mc_host_env "${APP_ENV_FILE}" "app" "${CURRENT_ACCESS_KEY}" "${CURRENT_SECRET_KEY}" "${STORAGE_ENDPOINT}"
  render_policy
}

cleanup_audit_probe_objects() {
  local probe_index probe_object
  if [[ -z "${ADMIN_ENV_FILE:-}" || ! -f "${ADMIN_ENV_FILE}" || -z "${STORAGE_BUCKET:-}" ]]; then
    return 0
  fi
  if ((${#AUDIT_PROBE_OBJECTS[@]} > 0)); then
    for probe_object in "${AUDIT_PROBE_OBJECTS[@]}"; do
      if ! run_mc "${ADMIN_ENV_FILE}" rm "admin/${STORAGE_BUCKET}/${probe_object}" >/dev/null 2>&1; then
        echo "[MINIO_SERVICE_IDENTITY_INVALID] audit_probe_cleanup_failed" >&2
      fi
    done
  fi
  AUDIT_PROBE_OBJECTS=()
}

cleanup_identity_workdir() {
  local status="$?"
  trap - EXIT INT TERM
  cleanup_audit_probe_objects
  if [[ -n "${WORKDIR:-}" ]]; then
    rm -rf "${WORKDIR}"
  fi
  exit "${status}"
}

run_mc() {
  local host_env="$1"
  shift
  docker run --rm \
    --network "${DOCKER_NETWORK}" \
    --env-file "${host_env}" \
    --mount "type=bind,src=${POLICY_FILE},dst=/policy.json,readonly" \
    "${MINIO_MC_IMAGE}" "$@"
}

run_mc_with_probe_file() {
  local host_env="$1"
  local probe_file="$2"
  shift 2
  docker run --rm \
    --network "${DOCKER_NETWORK}" \
    --env-file "${host_env}" \
    --mount "type=bind,src=${POLICY_FILE},dst=/policy.json,readonly" \
    --mount "type=bind,src=${probe_file},dst=/identity-probe.txt,readonly" \
    "${MINIO_MC_IMAGE}" "$@"
}

verify_policy_semantics() {
  docker run --rm \
    --mount "type=bind,src=${INFO_FILE},dst=/access-key-info.json,readonly" \
    --mount "type=bind,src=${POLICY_FILE},dst=/tracked-policy.json,readonly" \
    --mount "type=bind,src=${POLICY_VERIFIER},dst=/verify-minio-access-key-info.mjs,readonly" \
    "${NODE_RUNTIME_IMAGE}" \
    node /verify-minio-access-key-info.mjs /access-key-info.json /tracked-policy.json
}

wait_for_ready() {
  local attempt
  for attempt in $(seq 1 30); do
    if run_mc "${ADMIN_ENV_FILE}" ready admin >/dev/null 2>&1; then
      echo "[MINIO_SERVICE_IDENTITY] ready=true"
      return 0
    fi
    sleep 1
  done
  fail "minio_not_ready"
}

verify_live_identity() {
  if ! run_mc "${ADMIN_ENV_FILE}" admin accesskey info admin/ "${CURRENT_ACCESS_KEY}" --json > "${INFO_FILE}" 2>/dev/null; then
    fail "current_access_key_missing"
  fi
  local info
  info="$(compact_json_file "${INFO_FILE}")"
  [[ "${info}" == *"\"status\":\"success\""* ]] || fail "current_access_key_info_failed"
  [[ "${info}" == *"\"accessKey\":\"${CURRENT_ACCESS_KEY}\""* ]] || fail "current_access_key_mismatch"
  [[ "${info}" == *"\"parentUser\":\"${ROOT_ACCESS_KEY}\""* ]] || fail "current_parent_mismatch"
  [[ "${info}" == *"\"accountStatus\":\"on\""* ]] || fail "current_account_disabled"
  verify_policy_semantics || fail "current_policy_drift"
  if ! run_mc "${APP_ENV_FILE}" ls --json "app/${STORAGE_BUCKET}" > "${ERROR_FILE}" 2>&1; then
    local probe_error probe_reason="other"
    probe_error="$(compact_json_file "${ERROR_FILE}")"
    for known_reason in InvalidAccessKeyId SignatureDoesNotMatch AccessDenied NoSuchBucket; do
      if [[ "${probe_error}" == *"${known_reason}"* ]]; then
        probe_reason="${known_reason}"
        break
      fi
    done
    echo "[MINIO_SERVICE_IDENTITY] credential_probe_error=${probe_reason}" >&2
    fail "current_credential_probe_failed"
  fi
}

prepare_identity() {
  wait_for_ready
  run_mc "${ADMIN_ENV_FILE}" mb --ignore-existing "admin/${STORAGE_BUCKET}" >/dev/null 2>&1 ||
    fail "bucket_prepare_failed"
  run_mc "${ADMIN_ENV_FILE}" admin accesskey info admin/ "${CURRENT_ACCESS_KEY}" --json > "${INFO_FILE}" 2>/dev/null ||
    fail "current_access_key_missing"
  run_mc "${ADMIN_ENV_FILE}" admin accesskey edit admin/ "${CURRENT_ACCESS_KEY}" --policy /policy.json --json >/dev/null 2>&1 ||
    fail "current_policy_reconcile_failed"
  verify_live_identity
  echo "[MINIO_SERVICE_IDENTITY_VALID] mode=prepare current_version=${CURRENT_VERSION}"
}

create_rotation() {
  [[ -n "${CREDENTIAL_OUTPUT}" ]] || fail "credential_output_missing"
  [[ ! -e "${CREDENTIAL_OUTPUT}" ]] || fail "credential_output_already_exists"
  wait_for_ready
  run_mc "${ADMIN_ENV_FILE}" mb --ignore-existing "admin/${STORAGE_BUCKET}" >/dev/null 2>&1 ||
    fail "bucket_prepare_failed"
  local temporary="${CREDENTIAL_OUTPUT}.tmp.$$"
  : > "${temporary}"
  chmod 600 "${temporary}"
  if ! run_mc "${ADMIN_ENV_FILE}" admin accesskey create admin/ --policy /policy.json --json > "${temporary}" 2>/dev/null; then
    rm -f "${temporary}"
    fail "rotation_credential_create_failed"
  fi
  [[ -s "${temporary}" ]] || {
    rm -f "${temporary}"
    fail "rotation_credential_empty"
  }
  mv "${temporary}" "${CREDENTIAL_OUTPUT}"
  chmod 600 "${CREDENTIAL_OUTPUT}"
  echo "[MINIO_SERVICE_IDENTITY] rotation_credential_created=true"
}

audit_permissions() {
  verify_live_identity
  local object_file="${WORKDIR}/probe.txt"
  local audit_bucket="aquila-identity-audit-${CURRENT_VERSION}-$$"
  local probe_object
  printf 'aquila-storage-policy-probe\n' > "${object_file}"

  for prefix in "$(env_value "CUSTOM_STORAGE_KEYPREFIX")" "$(env_value "CUSTOM_STORAGE_CLOUD_KEY_PREFIX")"; do
    probe_object="${prefix}/.identity-probe-${CURRENT_VERSION}-$$"
    AUDIT_PROBE_OBJECTS+=("${probe_object}")
    run_mc_with_probe_file "${APP_ENV_FILE}" "${object_file}" cp /identity-probe.txt "app/${STORAGE_BUCKET}/${probe_object}" >/dev/null 2>&1 ||
      fail "allowed_put_denied"
    run_mc "${APP_ENV_FILE}" cat "app/${STORAGE_BUCKET}/${probe_object}" >/dev/null 2>&1 ||
      fail "allowed_get_denied"
    run_mc "${APP_ENV_FILE}" rm "app/${STORAGE_BUCKET}/${probe_object}" >/dev/null 2>&1 ||
      fail "allowed_delete_denied"
    probe_index=$((${#AUDIT_PROBE_OBJECTS[@]} - 1))
    unset "AUDIT_PROBE_OBJECTS[${probe_index}]"
  done

  if run_mc_with_probe_file "${APP_ENV_FILE}" "${object_file}" cp /identity-probe.txt "app/${STORAGE_BUCKET}/outside-prefix/denied" >/dev/null 2>&1; then
    fail "outside_prefix_write_allowed"
  fi
  if run_mc "${APP_ENV_FILE}" mb "app/${audit_bucket}" >/dev/null 2>&1; then
    run_mc "${ADMIN_ENV_FILE}" rb --force "admin/${audit_bucket}" >/dev/null 2>&1 ||
      fail "unexpected_bucket_cleanup_failed"
    fail "bucket_create_allowed"
  fi
  run_mc "${ADMIN_ENV_FILE}" mb --ignore-existing "admin/${audit_bucket}" >/dev/null 2>&1 || fail "audit_bucket_prepare_failed"
  if run_mc "${APP_ENV_FILE}" rb "app/${audit_bucket}" >/dev/null 2>&1; then
    fail "bucket_delete_allowed"
  fi
  run_mc "${ADMIN_ENV_FILE}" rb --force "admin/${audit_bucket}" >/dev/null 2>&1 || fail "audit_bucket_cleanup_failed"
  if run_mc "${APP_ENV_FILE}" admin policy list app/ >/dev/null 2>&1; then
    fail "admin_policy_operation_allowed"
  fi
  echo "[MINIO_SERVICE_IDENTITY_VALID] mode=audit current_version=${CURRENT_VERSION} allow_deny=true"
}

finalize_rotation() {
  wait_for_ready
  if [[ -z "${PREVIOUS_ACCESS_KEY}" ]]; then
    echo "[MINIO_SERVICE_IDENTITY_VALID] mode=finalize previous_present=false"
    return 0
  fi

  if run_mc "${ADMIN_ENV_FILE}" admin accesskey info admin/ "${PREVIOUS_ACCESS_KEY}" --json > "${INFO_FILE}" 2>&1; then
    run_mc "${ADMIN_ENV_FILE}" admin accesskey rm admin/ "${PREVIOUS_ACCESS_KEY}" --json >/dev/null 2>&1 ||
      fail "previous_access_key_revoke_failed"
  else
    local error
    error="$(compact_json_file "${INFO_FILE}")"
    [[ "${error}" == *"XMinioAdminNoSuchAccessKey"* ]] || fail "previous_access_key_lookup_failed"
  fi

  if run_mc "${ADMIN_ENV_FILE}" admin accesskey info admin/ "${PREVIOUS_ACCESS_KEY}" --json > "${ERROR_FILE}" 2>&1; then
    fail "previous_access_key_still_active"
  fi
  local post_error
  post_error="$(compact_json_file "${ERROR_FILE}")"
  [[ "${post_error}" == *"XMinioAdminNoSuchAccessKey"* ]] || fail "previous_access_key_revoke_unverified"
  remove_rotation_metadata
  echo "[MINIO_SERVICE_IDENTITY_VALID] mode=finalize previous_present=true revoked=true"
}

case "${MODE}" in
  wait|create-rotation|prepare|check|audit|finalize) ;;
  *) fail "mode_invalid" ;;
esac
if [[ "${MODE}" == "create-rotation" && "$#" -ne 4 ]]; then
  fail "create_rotation_arguments_invalid"
fi
if [[ "${MODE}" != "create-rotation" && "$#" -ne 3 ]]; then
  fail "arguments_invalid"
fi

validate_inputs
prepare_files

case "${MODE}" in
  wait) wait_for_ready ;;
  create-rotation) create_rotation ;;
  prepare) prepare_identity ;;
  check)
    wait_for_ready
    verify_live_identity
    echo "[MINIO_SERVICE_IDENTITY_VALID] mode=check current_version=${CURRENT_VERSION}"
    ;;
  audit) audit_permissions ;;
  finalize) finalize_rotation ;;
esac
