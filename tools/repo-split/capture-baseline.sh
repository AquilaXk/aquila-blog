#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 --expected-sha <40-hex>" >&2
}

if [ "$#" -ne 2 ] || [ "$1" != "--expected-sha" ]; then
  usage
  exit 2
fi

expected_sha="$2"
if [[ ! "${expected_sha}" =~ ^[0-9A-Fa-f]{40}$ ]]; then
  echo "--expected-sha must be a 40-hex SHA" >&2
  exit 2
fi
expected_sha="$(printf '%s' "${expected_sha}" | tr 'A-F' 'a-f')"

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

if ! origin_main_sha="$(git rev-parse --verify --quiet origin/main^{commit})"; then
  echo "origin/main is unavailable; fetch it explicitly before capturing a baseline" >&2
  exit 1
fi

if [ "${origin_main_sha}" != "${expected_sha}" ]; then
  echo "origin/main does not match expected SHA: expected=${expected_sha} actual=${origin_main_sha}" >&2
  exit 1
fi

tracked_file_count() {
  local path="$1"
  git ls-tree -r --name-only "${origin_main_sha}" -- "${path}" | wc -l | tr -d '[:space:]'
}

size_pack="$(git count-objects -vH | awk '$1 == "size-pack:" { print $2 " " $3 }')"
if [ -z "${size_pack}" ]; then
  echo "git count-objects did not report size-pack" >&2
  exit 1
fi

printf 'split_base_sha=%s\n' "${origin_main_sha}"
printf 'tracked_front_files=%s\n' "$(tracked_file_count front)"
printf 'tracked_back_files=%s\n' "$(tracked_file_count back)"
printf 'tracked_deploy_files=%s\n' "$(tracked_file_count deploy)"
printf 'size_pack=%s\n' "${size_pack}"
