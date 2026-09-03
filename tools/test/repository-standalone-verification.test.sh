#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
platform_script="${repo_root}/tools/repo-split/verify-platform-standalone.sh"
materializer_script="${repo_root}/tools/repo-split/materialize-compose-test-env.mjs"
materializer_test="${repo_root}/tools/test/materialize-compose-test-env.test.mjs"
workflow="${repo_root}/.github/workflows/ci.yml"

fail() {
  echo "repository-standalone-verification: FAIL: $*" >&2
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "missing file: ${1#"${repo_root}/"}"
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "${expected}" "${file}" \
    || fail "${file#"${repo_root}/"} is missing contract: ${expected}"
}

assert_not_contains() {
  local file="$1"
  local forbidden="$2"
  if grep -Fq -- "${forbidden}" "${file}"; then
    fail "${file#"${repo_root}/"} contains forbidden contract: ${forbidden}"
  fi
}

assert_before() {
  local file="$1"
  local first="$2"
  local second="$3"
  local first_line
  local second_line
  first_line="$(grep -Fn -- "${first}" "${file}" | head -n 1 | cut -d: -f1)"
  second_line="$(grep -Fn -- "${second}" "${file}" | head -n 1 | cut -d: -f1)"
  [[ -n "${first_line}" && -n "${second_line}" && "${first_line}" -lt "${second_line}" ]] \
    || fail "${file#"${repo_root}/"} must place '${first}' before '${second}'"
}

assert_actions_only() {
  local script="$1"
  local status=0
  GITHUB_ACTIONS=false bash "${script}" >/dev/null 2>&1 || status=$?
  [[ "${status}" -eq 2 ]] \
    || fail "${script#"${repo_root}/"} must fail closed with exit 2 outside GitHub Actions (got ${status})"
}

for file in "${platform_script}" "${materializer_script}" "${materializer_test}" "${workflow}"; do
  assert_file "${file}"
done
bash -n "${platform_script}" || fail "bash syntax error: ${platform_script#"${repo_root}/"}"
assert_actions_only "${platform_script}"
node --check "${materializer_script}" || fail "Node syntax error: ${materializer_script#"${repo_root}/"}"
node --test "${materializer_test}" || fail "Compose test env materializer regression failed"

# Parse the workflow structurally rather than trusting indentation-sensitive
# string matches. Ruby/Psych is present on GitHub-hosted Ubuntu and macOS.
command -v ruby >/dev/null 2>&1 || fail "ruby is required to parse workflow YAML"
ruby -e '
  require "yaml"
  document = YAML.load_file(ARGV.fetch(0))
  jobs = document.fetch("jobs")
  expected = {
    "platform-standalone" => ["Platform Standalone", "Run Platform archive standalone gate", "Upload Platform standalone evidence"],
  }
  expected.each do |job_id, (name, gate_step, upload_step)|
    job = jobs.fetch(job_id)
    raise "#{job_id} name mismatch" unless job.fetch("name") == name
    raise "#{job_id} must be contents: read" unless job.dig("permissions", "contents") == "read"

    steps = job.fetch("steps")
    checkout = steps.find { |step| step["name"] == "Checkout exact source SHA with history" }
    raise "#{job_id} checkout step missing" unless checkout
    raise "#{job_id} checkout must fetch full history" unless checkout.dig("with", "fetch-depth") == 0
    raise "#{job_id} checkout must not persist credentials" unless checkout.dig("with", "persist-credentials") == false

    gate = steps.find { |step| step["name"] == gate_step }
    upload = steps.find { |step| step["name"] == upload_step }
    raise "#{job_id} gate step missing" unless gate
    raise "#{job_id} evidence step missing" unless upload

    raise "platform-standalone must not expose secrets at job scope" if job.key?("env")
    # 기대값은 ci.yml의 raw GitHub secret 표현식 원문이다. 기본값 선택은 Gradle
    # provider chokepoint 한 곳만 담당한다.
    expected_secrets = {
      "TEST_DB_PASSWORD" => "${{ secrets.CI_DB_PASSWORD }}",
      "TEST_REDIS_PASSWORD" => "${{ secrets.CI_REDIS_PASSWORD }}",
    }
    expected_secrets.each do |key, value|
      raise "platform-standalone gate secret mismatch: #{key}" unless gate.dig("env", key) == value
    end
  end
' "${workflow}" || fail "ci.yml is invalid YAML or the standalone job structure drifted"

# Heavy gates must fail closed outside Actions. No local or test-only bypass may
# unlock Yarn, Gradle, Playwright, or Docker execution.
assert_contains "${platform_script}" 'GITHUB_ACTIONS:-}'
assert_not_contains "${platform_script}" 'STANDALONE_TEST_MODE'

# Evidence paths must remain valid after the scripts enter extracted roots.
assert_contains "${platform_script}" 'artifact_dir="$(cd "${artifact_dir}" && pwd -P)"'

# Downloaded evidence must be independently verifiable without recreating the
# ephemeral GitHub runner path. Both gates write relative names and fail closed
# if an absolute path is ever reintroduced into SHA256SUMS.
for script in "${platform_script}"; do
  assert_contains "${script}" 'write_evidence_checksums()'
  assert_contains "${script}" 'sha256sum "$@" > SHA256SUMS'
  assert_contains "${script}" "grep -Eq '^[0-9a-f]{64}  /' SHA256SUMS"
  assert_contains "${script}" 'sha256sum -c --strict SHA256SUMS'
done
assert_contains "${platform_script}" 'write_evidence_checksums \'
assert_contains "${platform_script}" '  archive-manifest.txt \'
assert_contains "${platform_script}" '  platform-standalone.log'

# Platform archive starts from a Platform-only tree and retains all required gates.
assert_not_contains "${platform_script}" 'rm -rf "${platform_root}/front"'
assert_contains "${platform_script}" 'git init --quiet'
assert_contains "${platform_script}" 'git update-ref refs/remotes/origin/main HEAD'
assert_contains "${platform_script}" 'check-platform-boundary.mjs'
assert_not_contains "${platform_script}" 'check-platform-boundary.mjs --report-only'
assert_contains "${platform_script}" 'tools/contracts/check-public-contracts.mjs'
assert_not_contains "${platform_script}" 'tools/privacy/ci-privacy-gate.mjs'
assert_contains "${platform_script}" './gradlew check --rerun-tasks'
assert_before "${platform_script}" './gradlew check --rerun-tasks' 'tools/contracts/check-public-contracts.mjs'
assert_contains "${platform_script}" 'materialize-compose-test-env.mjs'
assert_contains "${platform_script}" '--contract deploy/env/env.contract.json'
assert_contains "${platform_script}" 'docker-compose.prod.yml'
assert_contains "${platform_script}" 'config --quiet'
assert_not_contains "${platform_script}" 'sed -i'
assert_not_contains "${platform_script}" 'git clone'

# The Compose fixture generator follows the inherited canonical runtime target
# rather than hard-coding whichever monitoring or backend variables exist today.
assert_contains "${materializer_script}" 'RUNTIME_TARGET = "home-server-runtime"'
assert_contains "${materializer_script}" 'collectTargetKeys'
assert_contains "${materializer_script}" 'target.extends'
assert_contains "${materializer_script}" 'key?.kind !== "digest-image"'
assert_contains "${materializer_script}" 'registry.invalid/aquila-standalone'
assert_contains "${materializer_script}" 'deploy env contract inheritance cycle'
assert_contains "${materializer_script}" 'source and output must differ'
assert_not_contains "${materializer_script}" 'ALERTMANAGER_IMAGE'
assert_not_contains "${materializer_script}" 'POSTGRES_EXPORTER_IMAGE'
assert_not_contains "${materializer_script}" 'BACK_BLUE_IMAGE'

# The workflow publishes only the Platform standalone check and its evidence
# artifact from the same checked-out SHA.
assert_contains "${workflow}" 'name: Platform Standalone'
assert_contains "${workflow}" 'repository-standalone-verification.test.sh'
assert_contains "${workflow}" 'verify-platform-standalone.sh "${GITHUB_SHA}"'
assert_contains "${workflow}" 'platform-standalone-${{ github.sha }}'
assert_not_contains "${workflow}" 'Web Standalone'
assert_not_contains "${workflow}" 'verify-web-standalone.sh'
legacy_web_workflow='reusable-frontend''-verify.yml'
assert_not_contains "${workflow}" "${legacy_web_workflow}"
assert_contains "${workflow}" 'persist-credentials: false'
assert_contains "${workflow}" 'fetch-depth: 0'

echo "repository-standalone-verification: PASS"
