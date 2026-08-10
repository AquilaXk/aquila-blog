import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const guard = path.join(repoRoot, "tools/ci/verify-test-execution-inventory.mjs")

function fixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "test-execution-inventory-"))
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return root
}

function run(root, inventory = "tools/test/test-execution-inventory.json") {
  return execFileSync(process.execPath, [guard, "--root", root, "--inventory", inventory], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function inventory(entries) {
  return JSON.stringify({ version: 1, entries }, null, 2)
}

const workflow = (run, extra = "") => {
  const command = run.includes("\n") ? `|\n${run.split("\n").map((line) => `          ${line}`).join("\n")}` : run
  return `name: CI\non:\n  workflow_dispatch:\n  schedule:\n    - cron: '0 0 * * *'\njobs:\n  test:\n    runs-on: ubuntu-latest\n    ${extra}steps:\n      - name: run test\n        run: ${command}\n`
}
const direct = { path: "tools/test/example.test.mjs", kind: "direct-ci", workflow: ".github/workflows/ci.yml", job: "test", step: "run test" }

function withFixture(files, assertion) {
  const root = fixture(files)
  try { assertion(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test("missing inventory, exact version, and missing CLI values fail closed", () => withFixture({ "tools/test/example.test.mjs": "" }, (root) => {
  assert.throws(() => run(root), /inventory/i)
  writeFileSync(path.join(root, "tools/test/test-execution-inventory.json"), JSON.stringify({ version: 2, entries: [] }))
  assert.throws(() => run(root), /version|unclassified/i)
  assert.throws(() => execFileSync(process.execPath, [guard, "--root"], { encoding: "utf8", stdio: "pipe" }), /requires a value/i)
}))

test("direct-ci accepts only a literal target in a fail-propagating simple command", () => withFixture({
  "tools/test/example.test.mjs": "",
  "tools/test/test-execution-inventory.json": inventory([direct]),
  ".github/workflows/ci.yml": workflow("node --test tools/test/example.test.mjs"),
}, (root) => {
  assert.match(run(root), /PASS/)
  for (const command of [
    "echo node --test tools/test/example.test.mjs",
    ": node --test tools/test/example.test.mjs",
    "false && node --test tools/test/example.test.mjs",
    "node --test tools/test/example.test.mjs || true",
    "node --test tools/test/example.test.mjs; echo done",
    "node --test tools/test/example.test.mjs | tee result",
  ]) {
    writeFileSync(path.join(root, ".github/workflows/ci.yml"), workflow(command))
    assert.throws(() => run(root), /actual run/i)
  }
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), workflow("# node --test tools/test/example.test.mjs\n"))
  assert.throws(() => run(root), /actual run/i)
  for (const command of [
    "if false; then\n  node --test tools/test/example.test.mjs\nfi",
    "run_test() {\n  node --test tools/test/example.test.mjs\n}",
    "cat <<'EOF'\nnode --test tools/test/example.test.mjs\nEOF",
  ]) {
    writeFileSync(path.join(root, ".github/workflows/ci.yml"), workflow(command))
    assert.throws(() => run(root), /actual run/i)
  }
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), workflow("set -euo pipefail\nnode --test tools/test/example.test.mjs"))
  assert.match(run(root), /PASS/)
}))

test("unclassified, duplicate, and stale paths fail closed", () => withFixture({
  "tools/test/example.test.mjs": "",
  "tools/test/extra.test.sh": "#!/usr/bin/env bash\n",
  "tools/test/test-execution-inventory.json": inventory([direct, direct, { ...direct, path: "tools/test/missing.test.mjs" }]),
  ".github/workflows/ci.yml": workflow("node --test tools/test/example.test.mjs"),
}, (root) => assert.throws(() => run(root), /duplicate|stale|unclassified/i)))

test("job and step if false fail closed", () => withFixture({
  "tools/test/example.test.mjs": "",
  "tools/test/test-execution-inventory.json": inventory([direct]),
  ".github/workflows/ci.yml": workflow("node --test tools/test/example.test.mjs", "if: false\n    "),
}, (root) => {
  assert.throws(() => run(root), /job .*if: false/i)
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), workflow("node --test tools/test/example.test.mjs", ""))
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), `name: CI\non:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - name: run test\n        if: false\n        run: node --test tools/test/example.test.mjs\n`)
  assert.throws(() => run(root), /step .*if: false/i)
}))

test("indirect requires a reachable consumer with non-comment binding and executor evidence", () => withFixture({
  "tools/test/example.test.mjs": "",
  "tools/consumer.sh": "#!/usr/bin/env bash\n# child=tools/test/example.test.mjs\n# node --test ${child}\n",
  "tools/test/test-execution-inventory.json": inventory([{ ...direct, kind: "indirect", consumer: "tools/consumer.sh", binding: "child=tools/test/example.test.mjs", executor: "node --test ${child}" }]),
  ".github/workflows/ci.yml": workflow("bash tools/consumer.sh"),
}, (root) => {
  assert.throws(() => run(root), /indirect consumer/i)
  writeFileSync(path.join(root, "tools/consumer.sh"), "#!/usr/bin/env bash\nchild=tools/test/example.test.mjs\nunused=\"node --test ${child}\"\n")
  assert.throws(() => run(root), /indirect consumer/i)
  for (const source of [
    "// child=tools/test/example.test.mjs\n// node --test ${child}\n",
    "/* child=tools/test/example.test.mjs\nnode --test ${child}\n*/\n",
    "const unused = 'child=tools/test/example.test.mjs node --test ${child}'\n",
    "const unused = `child=tools/test/example.test.mjs node --test ${child}`\n",
  ]) {
    writeFileSync(path.join(root, "tools/consumer.sh"), source)
    assert.throws(() => run(root), /indirect consumer/i)
  }
  writeFileSync(path.join(root, "tools/consumer.sh"), "#!/usr/bin/env bash\nchild=tools/test/example.test.mjs\nnode --test ${child}\n")
  assert.match(run(root), /PASS/)
}))

const scheduledEntry = { path: "tools/test/example.test.sh", kind: "scheduled", workflow: ".github/workflows/ci.yml", job: "test", step: "run test", artifacts: ["restore-drill-summary.md", "restore-drill-result.env", "restore-privacy-gate.txt", "minio-checksums.sha256"], summaryStep: "Publish restore drill summary", summaryArtifact: "restore-drill-summary.md", summaryOutput: "GITHUB_STEP_SUMMARY", uploadStep: "Upload restore drill artifacts", artifactPath: "${{ runner.temp }}/restore-drill-artifacts" }
const scheduledWorkflow = ({ dispatch = true, schedule = true, verifier = true, summary = true, upload = true, summaryIf = "", uploadIf = "", summaryRun = 'cat "${{ runner.temp }}/restore-drill-artifacts/restore-drill-summary.md" >> "${GITHUB_STEP_SUMMARY}"', order = ["verifier", "summary", "upload"], artifactPath = "${{ runner.temp }}/restore-drill-artifacts", noFiles = "error" } = {}) => {
  const steps = {
    verifier: `      - name: run test\n        run: ${verifier ? "bash tools/test/example.test.sh" : "echo no verifier"}\n`,
    summary: summary ? `      - name: Publish restore drill summary\n${summaryIf ? `        if: ${summaryIf}\n` : ""}        run: ${summaryRun}\n` : "",
    upload: upload ? `      - name: Upload restore drill artifacts\n${uploadIf ? `        if: ${uploadIf}\n` : ""}        uses: actions/upload-artifact@abc\n        with:\n          path: ${artifactPath}\n          if-no-files-found: ${noFiles}\n` : "",
  }
  return `name: CI\non:\n${dispatch ? "  workflow_dispatch:\n" : ""}${schedule ? "  schedule:\n    - cron: '0 0 * * *'\n" : ""}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n${order.map((name) => steps[name]).join("")}`
}

test("scheduled requires triggers, verifier run, metadata, and structural upload evidence", () => withFixture({
  "tools/test/example.test.sh": "#!/usr/bin/env bash\n",
  "tools/test/test-execution-inventory.json": inventory([scheduledEntry]),
  ".github/workflows/ci.yml": scheduledWorkflow(),
}, (root) => {
  assert.match(run(root), /PASS/)
  const write = (contents) => writeFileSync(path.join(root, ".github/workflows/ci.yml"), contents)
  write(scheduledWorkflow({ schedule: false }))
  assert.throws(() => run(root), /schedule/i)
  write(scheduledWorkflow({ dispatch: false }))
  assert.throws(() => run(root), /workflow_dispatch/i)
  write(scheduledWorkflow({ verifier: false }))
  assert.throws(() => run(root), /actual run/i)
  writeFileSync(path.join(root, "tools/test/test-execution-inventory.json"), inventory([{ ...scheduledEntry, artifacts: scheduledEntry.artifacts.slice(0, -1) }]))
  assert.throws(() => run(root), /four restore-drill artifacts/i)
  writeFileSync(path.join(root, "tools/test/test-execution-inventory.json"), inventory([scheduledEntry]))
  write(scheduledWorkflow({ summary: false }))
  assert.throws(() => run(root), /summary step/i)
  write(scheduledWorkflow({ upload: false }))
  assert.throws(() => run(root), /lacks upload step/i)
  write(scheduledWorkflow({ order: ["upload", "verifier", "summary"] }))
  assert.throws(() => run(root), /must be ordered/i)
  write(scheduledWorkflow({ order: ["summary", "verifier", "upload"] }))
  assert.throws(() => run(root), /must be ordered/i)
  write(scheduledWorkflow({ summaryIf: "always()" }))
  assert.throws(() => run(root), /summary step must not override/i)
  write(scheduledWorkflow({ uploadIf: "always()" }))
  assert.throws(() => run(root), /upload step must not override/i)
  write(scheduledWorkflow({ summaryRun: "echo summary" }))
  assert.throws(() => run(root), /summary step must publish/i)
  write(scheduledWorkflow({ artifactPath: "wrong-path" }))
  assert.throws(() => run(root), /artifact path/i)
  write(scheduledWorkflow({ noFiles: "warn" }))
  assert.throws(() => run(root), /if-no-files-found/i)
}))

test("fixture-only and manual entries require their consumer and dispatch evidence", () => withFixture({
  "tools/test/example.promtool-test.yml": "groups: []\n",
  "tools/test/consumer.test.mjs": "// no fixture\n",
  "tools/test/test-execution-inventory.json": inventory([{ path: "tools/test/example.promtool-test.yml", kind: "fixture-only", workflow: ".github/workflows/ci.yml", job: "test", step: "run test", consumer: "tools/test/consumer.test.mjs", binding: "const fixture = \"tools/test/example.promtool-test.yml\"", executor: "run(fixture)" }]),
  ".github/workflows/ci.yml": workflow("node --test tools/test/consumer.test.mjs"),
}, (root) => {
  assert.throws(() => run(root), /fixture consumer/i)
  const manual = { path: "tools/test/consumer.test.mjs", kind: "manual", workflow: ".github/workflows/ci.yml", job: "test", step: "run test", reason: "operator approval required", evidence: "workflow dispatch run" }
  const fixtureEntry = { path: "tools/test/example.promtool-test.yml", kind: "fixture-only", workflow: ".github/workflows/ci.yml", job: "test", step: "run test", consumer: "tools/test/consumer.test.mjs", binding: "const fixture = \"tools/test/example.promtool-test.yml\"", executor: "run(fixture)" }
  writeFileSync(path.join(root, "tools/test/consumer.test.mjs"), "const fixture = \"tools/test/example.promtool-test.yml\"\nrun(fixture)\n")
  writeFileSync(path.join(root, "tools/test/test-execution-inventory.json"), inventory([fixtureEntry, manual]))
  assert.match(run(root), /PASS/)
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), `name: CI\non: pull_request\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - name: run test\n        run: node --test tools/test/consumer.test.mjs\n`)
  assert.throws(() => run(root), /workflow_dispatch/i)
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), workflow("node --test tools/test/consumer.test.mjs"))
  writeFileSync(path.join(root, "tools/test/test-execution-inventory.json"), inventory([fixtureEntry, { ...manual, reason: "" }]))
  assert.throws(() => run(root), /reason|evidence/i)
  writeFileSync(path.join(root, "tools/test/test-execution-inventory.json"), inventory([fixtureEntry, { ...manual, evidence: "" }]))
  assert.throws(() => run(root), /reason|evidence/i)
}))
