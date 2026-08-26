import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const script = path.join(repoRoot, "tools/repo-split/materialize-compose-test-env.mjs")

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" })
}

function occurrenceCount(text, prefix) {
  return text.split(/\r?\n/).filter((line) => line.startsWith(prefix)).length
}

test("materializer resolves runtime inheritance, replaces stale examples, and adds explicit Compose test values", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "compose-test-env-"))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  const source = path.join(root, "source.env")
  const output = path.join(root, "output.env")
  const contract = path.join(root, "contract.json")

  writeFileSync(
    source,
    [
      "OTHER=value",
      "BACK_BLUE_IMAGE=ghcr.io/example/back:sha-<commit7>",
      "CADDY_IMAGE=caddy@sha256:<digest>",
      "ALERTMANAGER_IMAGE=prom/alertmanager@sha256:<digest>",
      "PUBLIC_EDGE_PROBE_BASE_URL=https://stale.example",
      "",
    ].join("\n"),
  )
  writeFileSync(
    contract,
    `${JSON.stringify({
      targets: {
        "home-server-source": {
          keys: [
            { name: "CADDY_IMAGE", kind: "digest-image" },
            { name: "ALERTMANAGER_IMAGE", kind: "digest-image", required: false },
            { name: "POSTGRES_EXPORTER_IMAGE", kind: "digest-image", required: false },
            {
              name: "PUBLIC_EDGE_PROBE_BASE_URL",
              kind: "https-url",
              required: false,
              composeTestValue: "https://public-edge-probe.invalid",
            },
            { name: "IGNORED_VALUE" },
          ],
        },
        "home-server-runtime": {
          extends: "home-server-source",
          keys: [
            { name: "BACK_BLUE_IMAGE", kind: "digest-image" },
            { name: "BACK_GREEN_IMAGE", kind: "digest-image" },
          ],
        },
      },
    })}\n`,
  )

  const result = run(["--source", source, "--output", output, "--contract", contract])
  assert.equal(result.status, 0, result.stderr)
  const generated = readFileSync(output, "utf8")
  const digest = "0".repeat(64)

  assert.match(generated, /^OTHER=value$/m)
  for (const key of [
    "ALERTMANAGER_IMAGE",
    "BACK_BLUE_IMAGE",
    "BACK_GREEN_IMAGE",
    "CADDY_IMAGE",
    "POSTGRES_EXPORTER_IMAGE",
  ]) {
    assert.equal(occurrenceCount(generated, `${key}=`), 1, key)
  }
  assert.match(
    generated,
    new RegExp(`^ALERTMANAGER_IMAGE=registry\\.invalid/aquila-standalone/alertmanager-image@sha256:${digest}$`, "m"),
  )
  assert.match(
    generated,
    new RegExp(`^BACK_BLUE_IMAGE=registry\\.invalid/aquila-standalone/back-blue-image@sha256:${digest}$`, "m"),
  )
  assert.match(
    generated,
    new RegExp(`^POSTGRES_EXPORTER_IMAGE=registry\\.invalid/aquila-standalone/postgres-exporter-image@sha256:${digest}$`, "m"),
  )
  assert.doesNotMatch(generated, /<digest>|<commit7>|IGNORED_VALUE=/)
  assert.equal(occurrenceCount(generated, "PUBLIC_EDGE_PROBE_BASE_URL="), 1)
  assert.match(generated, /^PUBLIC_EDGE_PROBE_BASE_URL=https:\/\/public-edge-probe\.invalid$/m)
  assert.doesNotMatch(generated, /stale\.example/)

  const syntheticBlock = generated.split("# Standalone Compose validation values\n")[1].trim().split("\n")
  assert.deepEqual(syntheticBlock, [...syntheticBlock].sort())
})

test("materializer fails closed for missing targets, inheritance cycles, and same input/output", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "compose-test-env-invalid-"))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  const source = path.join(root, "source.env")
  const output = path.join(root, "output.env")
  const contract = path.join(root, "contract.json")
  writeFileSync(source, "OTHER=value\n")

  writeFileSync(contract, '{"targets":{}}\n')
  const missing = run(["--source", source, "--output", output, "--contract", contract])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /home-server-runtime deploy env contract is missing/)

  writeFileSync(
    contract,
    '{"targets":{"home-server-source":{"extends":"home-server-runtime","keys":[]},"home-server-runtime":{"extends":"home-server-source","keys":[]}}}\n',
  )
  const cycle = run(["--source", source, "--output", output, "--contract", contract])
  assert.equal(cycle.status, 1)
  assert.match(cycle.stderr, /deploy env contract inheritance cycle/)

  writeFileSync(contract, '{"targets":{"home-server-runtime":{"keys":[]}}}\n')
  const samePath = run(["--source", source, "--output", source, "--contract", contract])
  assert.equal(samePath.status, 1)
  assert.match(samePath.stderr, /source and output must differ/)
})
