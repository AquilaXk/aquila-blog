#!/usr/bin/env bash
set -euo pipefail

[ -n "${REMOTE_TMP_DIR:-}" ] || { echo "REMOTE_TMP_DIR is required" >&2; exit 1; }
# shellcheck source=/dev/null
source "${REMOTE_TMP_DIR}/rollout_common.sh"

HOME_APP_DIR="$(decode_b64 "${HOME_APP_DIR_B64:-}")"
[ -n "${HOME_APP_DIR:-}" ] || { echo "HOME_APP_DIR is empty. abort front deploy." >&2; exit 1; }
REMOTE_VARS_FILE="${REMOTE_TMP_DIR}/home-front-vars.env"

trap cleanup_remote_tmp EXIT

# shellcheck disable=SC1090
. "${REMOTE_VARS_FILE}"

cd "${HOME_APP_DIR}"

if [ -z "${HOME_DEPLOY_SHA:-}" ]; then
  echo "HOME_DEPLOY_SHA is empty. abort front deploy." >&2
  exit 1
fi
if [ -z "${HOME_FRONT_IMAGE:-}" ]; then
  echo "HOME_FRONT_IMAGE is empty. abort front deploy to avoid a stale front rollout." >&2
  exit 1
fi
# `repo:latest@sha256:<64hex>`는 아래 digest 정규식을 통과하므로 여기서 먼저 차단한다.
case "${HOME_FRONT_IMAGE}" in
  *":latest" | *":latest@"*)
    echo "latest tag is not allowed for HOME_FRONT_IMAGE: ${HOME_FRONT_IMAGE}" >&2
    exit 1
    ;;
esac
if ! printf '%s' "${HOME_FRONT_IMAGE}" | grep -Eq '^[^[:space:]@]+@sha256:[a-fA-F0-9]{64}$'; then
  echo "front image must be pinned by sha256 digest: ${HOME_FRONT_IMAGE}" >&2
  exit 1
fi
if ! printf '%s' "${HOME_FRONT_BUILD_SHA:-}" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "HOME_FRONT_BUILD_SHA must be the 40-hex commit the front image was built from: '${HOME_FRONT_BUILD_SHA:-}'" >&2
  exit 1
fi

umask 077
git fetch origin main --prune
if ! git cat-file -e "${HOME_DEPLOY_SHA}^{commit}" 2>/dev/null; then
  git fetch origin "${HOME_DEPLOY_SHA}" --depth 1 || true
fi
if ! git cat-file -e "${HOME_DEPLOY_SHA}^{commit}" 2>/dev/null; then
  echo "deploy sha not found in remote repository: ${HOME_DEPLOY_SHA}" >&2
  exit 1
fi
if ! git merge-base --is-ancestor "${HOME_DEPLOY_SHA}" "origin/main"; then
  echo "deploy sha is not reachable from origin/main: ${HOME_DEPLOY_SHA}" >&2
  exit 1
fi

if ! preflight_profile_workspace_cutover_source_floor front; then
  exit 1
fi
git checkout --force "${HOME_DEPLOY_SHA}"

find deploy/homeserver/caddy deploy/homeserver/monitoring -type d -exec chmod 0755 {} + 2>/dev/null || true
find deploy/homeserver/caddy deploy/homeserver/monitoring -type f -exec chmod 0644 {} + 2>/dev/null || true

chmod +x \
  deploy/homeserver/blue_green_deploy.sh \
  deploy/homeserver/materialize_service_env.sh

# front rollout은 .env.prod를 다시 만들지 않는다. 도메인 파생 계약은 backend 배포가 소유한다.
if [ ! -f deploy/homeserver/.env.prod ]; then
  echo "deploy/homeserver/.env.prod is missing; run a backend deploy before the first front deploy" >&2
  exit 1
fi

if [ -z "${HOME_GHCR_USERNAME:-}" ] || [ -z "${HOME_GHCR_TOKEN:-}" ]; then
  echo "HOME_GHCR_USERNAME and HOME_GHCR_TOKEN are required for private GHCR deploy" >&2
  exit 1
fi
echo "${HOME_GHCR_TOKEN}" | docker login ghcr.io -u "${HOME_GHCR_USERNAME}" --password-stdin

DEPLOY_TARGET=front \
  STAGED_FRONT_IMAGE="${HOME_FRONT_IMAGE}" \
  STAGED_FRONT_BUILD_SHA="${HOME_FRONT_BUILD_SHA}" \
  ./deploy/homeserver/blue_green_deploy.sh

cleanup_remote_tmp
trap - EXIT
