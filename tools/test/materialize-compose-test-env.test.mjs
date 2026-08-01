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

test("materializer replaces stale examples and adds every digest-image key deterministically", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "compose-test-env-"))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  const source = path.join(root, "source.env")
  const output = path.join(root, "output.env")
  const contract = path.join(root, "contract.json")

  writeFileSync(
    source,
    [
      "OTHER=value",
      "BACK_IMAGE=ghcr.io/example/back:sha-<commit7>",
      "CADDY_IMAGE=caddy@sha256:<digest>",
      "ALERTMANAGER_IMAGE=prom/alertmanager@sha256:<digest>",
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
            { name: "IGNORED_VALUE" },
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
  assert.equal(occurrenceCount(generated, "BACK_IMAGE="), 1)
  assert.equal(occurrenceCount(generated, "ALERTMANAGER_IMAGE="), 1)
  assert.equal(occurrenceCount(generated, "CADDY_IMAGE="), 1)
  assert.equal(occurrenceCount(generated, "POSTGRES_EXPORTER_IMAGE="), 1)
  assert.match(generated, /^BACK_IMAGE=ghcr\.io\/aquilaxk\/aquila-blog-back:sha-0000000$/m)
  assert.match(
    generated,
    new RegExp(`^ALERTMANAGER_IMAGE=registry\\.invalid/aquila-standalone/alertmanager-image@sha256:${digest}$`, "m"),
  )
  assert.match(
    generated,
    new RegExp(`^POSTGRES_EXPORTER_IMAGE=registry\\.invalid/aquila-standalone/postgres-exporter-image@sha256:${digest}$`, "m"),
  )
  assert.doesNotMatch(generated, /<digest>|<commit7>|IGNORED_VALUE=/)

  const syntheticBlock = generated.split("# Standalone Compose validation images\n")[1].trim().split("\n")
  assert.deepEqual(syntheticBlock, [...syntheticBlock].sort())
})

test("materializer fails closed for malformed contracts and same input/output", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "compose-test-env-invalid-"))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  const source = path.join(root, "source.env")
  const contract = path.join(root, "contract.json")
  writeFileSync(source, "OTHER=value\n")
  writeFileSync(contract, '{"targets":{}}\n')

  const malformed = run(["--source", source, "--output", path.join(root, "output.env"), "--contract", contract])
  assert.equal(malformed.status, 1)
  assert.match(malformed.stderr, /home-server-source deploy env contract is missing/)

  writeFileSync(contract, '{"targets":{"home-server-source":{"keys":[]}}}\n')
  const samePath = run(["--source", source, "--output", source, "--contract", contract])
  assert.equal(samePath.status, 1)
  assert.match(samePath.stderr, /source and output must differ/)
})
