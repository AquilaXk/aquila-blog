#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash tools/repo-split/verify-platform-standalone.sh [source-ref]

Creates a temporary Platform archive, removes front/**, and runs the backend,
contracts, privacy, and production Compose gates that must survive the split.
Heavy execution is restricted to GitHub Actions.
USAGE
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "verify-platform-standalone: heavy standalone verification is GitHub Actions-only" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${1:-${STANDALONE_SOURCE_REF:-HEAD}}"
source_sha="$(git -C "${repo_root}" rev-parse "${source_ref}^{commit}")"
artifact_dir="${STANDALONE_ARTIFACT_DIR:-${RUNNER_TEMP:-${repo_root}/.tmp}/platform-standalone}"
work_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aquila-platform-standalone.XXXXXX")"
platform_root="${work_dir}/archive"
log_file="${artifact_dir}/platform-standalone.log"

cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

mkdir -p "${platform_root}" "${artifact_dir}"
: > "${log_file}"

run_step() {
  local label="$1"
  shift
  {
    printf '\n===== %s =====\n' "${label}"
    printf 'command:'
    printf ' %q' "$@"
    printf '\n'
  } | tee -a "${log_file}"
  "$@" 2>&1 | tee -a "${log_file}"
}

printf '%s\n' "${source_sha}" > "${artifact_dir}/source-sha.txt"
printf 'gate=Platform Standalone\nsource_ref=%s\nsource_sha=%s\n' \
  "${source_ref}" "${source_sha}" > "${artifact_dir}/summary.txt"

git -C "${repo_root}" archive --format=tar "${source_sha}" \
  | tar -xf - -C "${platform_root}"
rm -rf "${platform_root}/front"

if [[ -e "${platform_root}/front" ]]; then
  echo "verify-platform-standalone: front/ still exists after archive split" >&2
  exit 1
fi
if [[ ! -x "${platform_root}/back/gradlew" ]]; then
  echo "verify-platform-standalone: backend Gradle wrapper is missing or not executable" >&2
  exit 1
fi
if [[ ! -f "${platform_root}/deploy/homeserver/docker-compose.prod.yml" ]]; then
  echo "verify-platform-standalone: production Compose file is missing" >&2
  exit 1
fi

# Recreate Git metadata after front/ removal so boundary checks inspect the
# exact future Platform tree rather than the parent monorepo index.
(
  cd "${platform_root}"
  git init --quiet
  git config user.name "Aquila Standalone Gate"
  git config user.email "standalone-gate@users.noreply.github.com"
  git add -f .
  git commit --quiet -m "chore(snapshot): Platform standalone ${source_sha}"
  git branch -M main
  git update-ref refs/remotes/origin/main HEAD
)

(
  cd "${platform_root}"
  git ls-files | LC_ALL=C sort > "${artifact_dir}/archive-manifest.txt"

  run_step "Report Platform repository boundary" \
    node tools/repo-boundary/check-platform-boundary.mjs --report-only

  # The full backend gate emits the canonical OpenAPI and ErrorCode build
  # artifacts consumed by check-public-contracts.mjs. Running it first proves
  # both generation and drift from one immutable Platform snapshot.
  run_step "Run backend required check and generate public contract inputs" \
    bash -lc 'cd back && ./gradlew check --rerun-tasks'
  run_step "Verify canonical public contract" \
    node tools/contracts/check-public-contracts.mjs
  run_step "Run privacy drift gate" \
    node tools/privacy/ci-privacy-gate.mjs

  cp deploy/homeserver/.env.prod.example deploy/homeserver/.env.prod
  # Replace documentation-only digest placeholders with syntactically valid,
  # non-routable test digests. No image is pulled by `docker compose config`.
  sed -i \
    -e 's/sha-<commit7>/sha-0000000/g' \
    -e 's/sha256:<digest>/sha256:0000000000000000000000000000000000000000000000000000000000000000/g' \
    deploy/homeserver/.env.prod
  run_step "Materialize per-service Compose env" \
    bash deploy/homeserver/materialize_service_env.sh deploy/homeserver/.env.prod
  run_step "Validate production Compose configuration" \
    docker compose \
      --env-file deploy/homeserver/.env.prod \
      -f deploy/homeserver/docker-compose.prod.yml \
      config --quiet
)

sha256sum \
  "${artifact_dir}/archive-manifest.txt" \
  "${artifact_dir}/platform-standalone.log" \
  > "${artifact_dir}/SHA256SUMS"

echo "verify-platform-standalone: PASS source_sha=${source_sha}"
