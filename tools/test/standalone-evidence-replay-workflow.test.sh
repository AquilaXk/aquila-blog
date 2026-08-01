#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
workflow="${repo_root}/.github/workflows/standalone-evidence-replay.yml"

fail() {
  echo "standalone-evidence-replay-workflow: FAIL: $*" >&2
  exit 1
}

[[ -f "${workflow}" ]] || fail "missing workflow: .github/workflows/standalone-evidence-replay.yml"
command -v ruby >/dev/null 2>&1 || fail "ruby is required to parse workflow YAML"

ruby - "${workflow}" <<'RUBY'
  require "yaml"
  document = YAML.load_file(ARGV.fetch(0))
  trigger = document["on"] || document[true]
  expected_trigger = {
    "issue_comment" => {"types" => ["created"]},
    "pull_request" => {
      "branches" => ["main"],
      "paths" => [
        ".github/workflows/standalone-evidence-replay.yml",
        "tools/test/standalone-evidence-replay-workflow.test.sh",
      ],
    },
  }
  raise "workflow trigger mismatch" unless trigger == expected_trigger
  raise "top-level permissions must be contents: read" unless document.fetch("permissions") == {"contents" => "read"}

  jobs = document.fetch("jobs")
  contract = jobs.fetch("contract_test")
  prepare = jobs.fetch("prepare")
  web = jobs.fetch("web_standalone")
  platform = jobs.fetch("platform_standalone")
  record = jobs.fetch("record_evidence")

  raise "contract test must be PR-only" unless contract.fetch("if") == "github.event_name == 'pull_request'"
  raise "contract test permissions mismatch" unless contract.fetch("permissions") == {"contents" => "read"}
  contract_checkout = contract.fetch("steps").find { |step| step["name"] == "Checkout replay workflow" }
  raise "contract checkout missing" unless contract_checkout
  raise "contract checkout must not persist credentials" unless contract_checkout.dig("with", "persist-credentials") == false
  contract_run = contract.fetch("steps").find { |step| step["name"] == "Verify replay workflow contract" }
  raise "contract test command mismatch" unless contract_run&.fetch("run") == "bash tools/test/standalone-evidence-replay-workflow.test.sh"

  guard = prepare.fetch("if")
  [
    "github.event_name == 'issue_comment'",
    "github.event.issue.number == 1463",
    "github.actor == github.repository_owner",
    "github.event.issue.pull_request == null",
    "startsWith(github.event.comment.body, '/standalone-evidence ')",
  ].each do |entry|
    raise "prepare guard missing #{entry}" unless guard.include?(entry)
  end
  raise "prepare must be contents: read" unless prepare.fetch("permissions") == {"contents" => "read"}
  prepare_checkout = prepare.fetch("steps").find { |step| step["name"] == "Checkout current main with history" }
  raise "prepare checkout missing" unless prepare_checkout
  raise "prepare checkout ref mismatch" unless prepare_checkout.dig("with", "ref") == "main"
  raise "prepare checkout must fetch full history" unless prepare_checkout.dig("with", "fetch-depth") == 0
  raise "prepare checkout must not persist credentials" unless prepare_checkout.dig("with", "persist-credentials") == false
  source = prepare.fetch("steps").find { |step| step["id"] == "source" }
  raise "source validation step missing" unless source
  raise "comment body must enter through env" unless source.dig("env", "COMMENT_BODY") == "${{ github.event.comment.body }}"
  source_run = source.fetch("run")
  [
    "^/standalone-evidence[[:space:]]+([0-9a-f]{40})[[:space:]]*$",
    "git rev-parse origin/main^{commit}",
    "git merge-base --is-ancestor",
    "source SHA must equal current main",
  ].each do |entry|
    raise "source validator missing #{entry}" unless source_run.include?(entry)
  end

  {"web_standalone" => web, "platform_standalone" => platform}.each do |job_id, job|
    expected_name = job_id == "web_standalone" ? "Web Standalone" : "Platform Standalone"
    raise "#{job_id} name mismatch" unless job.fetch("name") == expected_name
    raise "#{job_id} must need prepare" unless job.fetch("needs") == "prepare"
    raise "#{job_id} must be contents: read" unless job.fetch("permissions") == {"contents" => "read"}
    checkout = job.fetch("steps").find { |step| step["name"] == "Checkout exact source SHA with history" }
    raise "#{job_id} checkout missing" unless checkout
    raise "#{job_id} checkout ref mismatch" unless checkout.dig("with", "ref") == "${{ needs.prepare.outputs.source_sha }}"
    raise "#{job_id} checkout must fetch full history" unless checkout.dig("with", "fetch-depth") == 0
    raise "#{job_id} checkout must not persist credentials" unless checkout.dig("with", "persist-credentials") == false
    upload = job.fetch("steps").find { |step| step["name"]&.start_with?("Upload ") }
    raise "#{job_id} upload missing" unless upload
    artifact_name = upload.dig("with", "name")
    ["needs.prepare.outputs.source_sha", "github.run_id", "github.run_attempt"].each do |entry|
      raise "#{job_id} artifact name missing #{entry}" unless artifact_name.include?(entry)
    end
  end

  platform_gate = platform.fetch("steps").find { |step| step["name"] == "Run Platform archive standalone gate" }
  expected_secrets = {
    "TEST_DB_PASSWORD" => "${{ secrets.CI_DB_PASSWORD || 'test_db_password_change_me' }}",
    "TEST_REDIS_PASSWORD" => "${{ secrets.CI_REDIS_PASSWORD || 'test_redis_password_change_me' }}",
  }
  expected_secrets.each do |key, value|
    raise "replay platform secret mismatch: #{key}" unless platform_gate.dig("env", key) == value
  end

  raise "record must depend on all gates" unless record.fetch("needs") == ["prepare", "web_standalone", "platform_standalone"]
  raise "record must run after gate failure" unless record.fetch("if").include?("always()")
  raise "record must require prepare success" unless record.fetch("if").include?("needs.prepare.result == 'success'")
  raise "record permissions mismatch" unless record.fetch("permissions") == {"contents" => "read", "issues" => "write"}
  recorder = record.fetch("steps").find { |step| step["name"] == "Record standalone evidence on issue" }
  raise "recorder missing" unless recorder
  script = recorder.dig("with", "script")
  [
    "context.runId",
    "context.runAttempt",
    "standalone-evidence:",
    "webResult",
    "platformResult",
    "github.rest.issues.createComment",
  ].each do |entry|
    raise "recorder script missing #{entry}" unless script.include?(entry)
  end
RUBY

echo "standalone-evidence-replay-workflow: PASS"
