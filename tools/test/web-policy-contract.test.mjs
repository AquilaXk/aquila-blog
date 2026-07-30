import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "../..")
const importer = path.join(root, "tools/contracts/import-web-policy-manifest.mjs")
const checker = path.join(root, "tools/contracts/check-web-policy-lock.mjs")
const source = path.join(root, "front/contracts/export/legal-policy-manifest.json")
const webSha = "4c085625f5bdbef8f093d0d0891c984046c852e1"
const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "web-policy-lock-"))
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" })

test("import requires explicit monorepo transition authority and writes a checkable lock", () => {
  const output = path.join(fixture(), "lock.json")
  const denied = run(importer, ["--source", source, "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--output", output])
  assert.notEqual(denied.status, 0)
  const imported = run(importer, ["--source", source, "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--allow-monorepo-source", "--output", output])
  assert.equal(imported.status, 0, imported.stderr)
  assert.equal(run(checker, ["--lock", output]).status, 0)
})

test("import rejects non-40-lowercase source commits", () => {
  const result = run(importer, ["--source", source, "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", "BAD", "--output", path.join(fixture(), "lock.json")])
  assert.notEqual(result.status, 0)
})

test("checker rejects noncanonical manifest bytes and manifest hash drift", () => {
  const directory = fixture()
  const output = path.join(directory, "lock.json")
  assert.equal(run(importer, ["--source", source, "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--allow-monorepo-source", "--output", output]).status, 0)
  const lock = JSON.parse(fs.readFileSync(output, "utf8"))
  lock.manifestSha256 = crypto.createHash("sha256").update("drift").digest("hex")
  fs.writeFileSync(output, `${JSON.stringify(lock, null, 2)}\n`)
  const result = run(checker, ["--lock", output])
  assert.notEqual(result.status, 0)
})
