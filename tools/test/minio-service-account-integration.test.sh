#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

identity_script="deploy/homeserver/minio_service_identity.sh"
rotation_tool="tools/env/rotate-storage-identity.mjs"
for required in "${identity_script}" "${rotation_tool}"; do
  if [[ ! -f "${required}" ]]; then
    echo "[test] missing required MinIO identity surface: ${required}" >&2
    exit 1
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "[test] Docker is required for the MinIO service-account integration contract" >&2
  exit 1
fi

minio_image="minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e"
mc_image="minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727"
node_image="node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293"
suffix="$$"
container_name="aquila-minio-identity-${suffix}"
network_name="aquila-minio-identity-${suffix}"
workdir="$(mktemp -d)"
env_file="${workdir}/minio.env"
container_env_file="${workdir}/minio-container.env"
old_env_file="${workdir}/old.env"
credential_file="${workdir}/credential.json"
log_file="${workdir}/execution.log"
root_secret="root-integration-secret-value"
current_step="setup"

private_file_mode() {
  local file="$1"
  local mode
  if mode="$(stat -c '%a' "${file}" 2>/dev/null)" && [[ "${mode}" =~ ^[0-7]{3,4}$ ]]; then
    printf '%s' "${mode}"
    return 0
  fi
  if mode="$(stat -f '%Lp' "${file}" 2>/dev/null)" && [[ "${mode}" =~ ^[0-7]{3,4}$ ]]; then
    printf '%s' "${mode}"
    return 0
  fi
  echo "[test] unable to read generated credential file mode" >&2
  return 1
}

cleanup() {
  docker rm -f "${container_name}" >/dev/null 2>&1 || true
  docker network rm "${network_name}" >/dev/null 2>&1 || true
  rm -rf "${workdir}"
}

on_exit() {
  local status="$?"
  trap - EXIT
  if [[ "${status}" -ne 0 ]]; then
    echo "[test] MinIO service-account integration failed at step=${current_step}" >&2
    local secret leak_detected="false"
    for secret in "${root_secret}" "${first_app_secret:-}" "${second_app_secret:-}"; do
      [[ -n "${secret}" ]] || continue
      if [[ -f "${log_file}" ]] && grep -qF "${secret}" "${log_file}"; then
        leak_detected="true"
      fi
    done
    if [[ "${leak_detected}" == "true" ]]; then
      echo "[test] failure log suppressed because it contains credential material" >&2
    elif [[ -f "${log_file}" ]]; then
      awk '/^\[(MINIO_SERVICE_IDENTITY|storage-identity)/ { print > "/dev/stderr" }' "${log_file}"
    fi
  fi
  cleanup
  exit "${status}"
}
trap on_exit EXIT

current_step="create-network"
docker network create "${network_name}" >/dev/null
{
  printf 'MINIO_ROOT_USER=minio-root\n'
  printf 'MINIO_ROOT_PASSWORD=%s\n' "${root_secret}"
} > "${container_env_file}"
chmod 600 "${container_env_file}"
current_step="start-minio"
docker run -d --name "${container_name}" --network "${network_name}" --network-alias minio \
  --env-file "${container_env_file}" \
  "${minio_image}" server /data >/dev/null

{
  printf 'MINIO_IMAGE=%s\n' "${minio_image}"
  printf 'MINIO_MC_IMAGE=%s\n' "${mc_image}"
  printf 'NODE_RUNTIME_IMAGE=%s\n' "${node_image}"
  printf 'MINIO_ROOT_USER=minio-root\n'
  printf 'MINIO_ROOT_PASSWORD=%s\n' "${root_secret}"
  printf 'CUSTOM_STORAGE_ENABLED=true\n'
  printf 'CUSTOM_STORAGE_ENDPOINT=http://minio:9000\n'
  printf 'CUSTOM_STORAGE_REGION=us-east-1\n'
  printf 'CUSTOM_STORAGE_BUCKET=blog-images\n'
  printf 'CUSTOM_STORAGE_ACCESSKEY=minio-root\n'
  printf 'CUSTOM_STORAGE_SECRETKEY=%s\n' "${root_secret}"
  printf 'CUSTOM_STORAGE_CREDENTIAL_VERSION=1\n'
  printf 'CUSTOM_STORAGE_PATHSTYLEACCESS=true\n'
  printf 'CUSTOM_STORAGE_KEYPREFIX=posts\n'
  printf 'CUSTOM_STORAGE_CLOUD_KEY_PREFIX=cloud\n'
} > "${env_file}"
chmod 600 "${env_file}"

current_step="wait-for-minio"
for _ in $(seq 1 30); do
  if bash "${identity_script}" wait "${env_file}" "${network_name}" >> "${log_file}" 2>&1; then
    break
  fi
  sleep 1
done
if ! bash "${identity_script}" wait "${env_file}" "${network_name}" >> "${log_file}" 2>&1; then
  echo "[test] pinned MinIO did not become ready" >&2
  exit 1
fi

current_step="create-first-identity"
bash "${identity_script}" create-rotation "${env_file}" "${network_name}" "${credential_file}" >> "${log_file}" 2>&1
credential_mode="$(private_file_mode "${credential_file}")"
if [[ "${credential_mode}" != "600" && "${credential_mode}" != "0600" ]]; then
  echo "[test] generated credential handoff must be mode 600" >&2
  exit 1
fi
current_step="prepare-first-owner-env"
node "${rotation_tool}" prepare --env-file "${env_file}" --credential-file "${credential_file}" \
  --now-epoch-seconds 1700000000 >> "${log_file}" 2>&1
first_app_secret="$(awk -F= '$1 == "CUSTOM_STORAGE_SECRETKEY" { print substr($0, index($0, "=") + 1); exit }' "${env_file}")"
if [[ "${first_app_secret}" =~ ^[-A-Za-z0-9+/_~.=]+$ ]]; then
  echo "[storage-identity] generated_secret_length=${#first_app_secret} mc_host_safe=true" >> "${log_file}"
else
  echo "[storage-identity] generated_secret_length=${#first_app_secret} mc_host_safe=false" >> "${log_file}"
fi
current_step="prepare-first-live-identity"
bash "${identity_script}" prepare "${env_file}" "${network_name}" >> "${log_file}" 2>&1
current_step="audit-first-live-identity"
bash "${identity_script}" audit "${env_file}" "${network_name}" >> "${log_file}" 2>&1

cp "${env_file}" "${old_env_file}"
chmod 600 "${old_env_file}"
current_step="create-second-identity"
bash "${identity_script}" create-rotation "${env_file}" "${network_name}" "${credential_file}" >> "${log_file}" 2>&1
current_step="prepare-second-owner-env"
node "${rotation_tool}" prepare --env-file "${env_file}" --credential-file "${credential_file}" \
  --now-epoch-seconds 1700000100 >> "${log_file}" 2>&1
second_app_secret="$(awk -F= '$1 == "CUSTOM_STORAGE_SECRETKEY" { print substr($0, index($0, "=") + 1); exit }' "${env_file}")"
current_step="prepare-second-live-identity"
bash "${identity_script}" prepare "${env_file}" "${network_name}" >> "${log_file}" 2>&1
current_step="verify-previous-before-finalize"
bash "${identity_script}" check "${old_env_file}" "${network_name}" >> "${log_file}" 2>&1
current_step="finalize-previous-live-identity"
bash "${identity_script}" finalize "${env_file}" "${network_name}" >> "${log_file}" 2>&1

current_step="verify-previous-revoked"
set +e
bash "${identity_script}" check "${old_env_file}" "${network_name}" >> "${log_file}" 2>&1
old_status=$?
set -e
if [[ "${old_status}" -eq 0 ]]; then
  echo "[test] previous application key must be denied after finalize" >&2
  exit 1
fi

current_step="finalize-owner-env"
node "${rotation_tool}" finalize --env-file "${env_file}" >> "${log_file}" 2>&1
current_step="verify-finalize-idempotency"
bash "${identity_script}" finalize "${env_file}" "${network_name}" >> "${log_file}" 2>&1
current_step="audit-final-live-identity"
bash "${identity_script}" audit "${env_file}" "${network_name}" >> "${log_file}" 2>&1

for secret in "${root_secret}" "${first_app_secret}" "${second_app_secret}"; do
  if grep -qF "${secret}" "${log_file}"; then
    echo "[test] MinIO identity diagnostics exposed credential material" >&2
    exit 1
  fi
done

current_step="complete"
echo "minio service-account integration contract passed"
