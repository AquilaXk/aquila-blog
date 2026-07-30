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
const webSha = "4c085625f5bdbef8f093d0d0891c984046c852e1"
const fixture = () => fs.mkdtempSync(path.join(os.tmpdir(), "web-policy-lock-"))
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" })
const source = (directory) => {
  const file = path.join(directory, "manifest.json")
  fs.writeFileSync(file, `${JSON.stringify({ version: 1, contract: "aquila-public-legal-policies", active: { terms: { version: "1.0.2", contentSha256: "1".repeat(64) }, privacy: { version: "1.0.3", contentSha256: "2".repeat(64) }, cookies: { version: "1.0.3", contentSha256: "3".repeat(64) } } }, null, 2)}\n`)
  return file
}

test("import requires explicit monorepo transition authority and writes a checkable lock", () => {
  const output = path.join(fixture(), "lock.json")
  const denied = run(importer, ["--source", source(path.dirname(output)), "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--output", output])
  assert.notEqual(denied.status, 0)
  const imported = run(importer, ["--source", source(path.dirname(output)), "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--allow-monorepo-source", "--output", output])
  assert.equal(imported.status, 0, imported.stderr)
  assert.equal(run(checker, ["--lock", output]).status, 0)
})

test("import rejects non-40-lowercase source commits", () => {
  const directory = fixture()
  const result = run(importer, ["--source", source(directory), "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", "BAD", "--output", path.join(directory, "lock.json")])
  assert.notEqual(result.status, 0)
})

test("import rejects unauthorized repositories, extra manifest fields, and noncanonical source bytes", () => {
  const directory = fixture()
  const manifest = JSON.parse(fs.readFileSync(source(directory), "utf8"))
  manifest.unexpected = true
  const extra = path.join(directory, "extra.json")
  fs.writeFileSync(extra, `${JSON.stringify(manifest, null, 2)}\n`)
  assert.notEqual(run(importer, ["--source", extra, "--source-repository", "AquilaXk/other", "--source-commit", webSha, "--output", path.join(directory, "lock.json")]).status, 0)
  assert.notEqual(run(importer, ["--source", extra, "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", webSha, "--output", path.join(directory, "lock.json")]).status, 0)
  const noncanonical = path.join(directory, "noncanonical.json")
  fs.writeFileSync(noncanonical, `${JSON.stringify(JSON.parse(fs.readFileSync(source(directory), "utf8")))}\n`)
  assert.notEqual(run(importer, ["--source", noncanonical, "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", webSha, "--output", path.join(directory, "lock.json")]).status, 0)
})

test("checker rejects noncanonical manifest bytes and manifest hash drift", () => {
  const directory = fixture()
  const output = path.join(directory, "lock.json")
  assert.equal(run(importer, ["--source", source(directory), "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--allow-monorepo-source", "--output", output]).status, 0)
  const lock = JSON.parse(fs.readFileSync(output, "utf8"))
  lock.manifestSha256 = crypto.createHash("sha256").update("drift").digest("hex")
  fs.writeFileSync(output, `${JSON.stringify(lock, null, 2)}\n`)
  const result = run(checker, ["--lock", output])
  assert.notEqual(result.status, 0)
})

test("checker rejects extra lock fields", () => {
  const directory = fixture()
  const output = path.join(directory, "lock.json")
  assert.equal(run(importer, ["--source", source(directory), "--source-repository", "AquilaXk/aquila-blog", "--source-commit", webSha, "--allow-monorepo-source", "--output", output]).status, 0)
  const lock = JSON.parse(fs.readFileSync(output, "utf8"))
  lock.unexpected = true
  fs.writeFileSync(output, `${JSON.stringify(lock, null, 2)}\n`)
  assert.notEqual(run(checker, ["--lock", output]).status, 0)
})

test("importer and checker reject malformed arguments", () => {
  const directory = fixture()
  assert.notEqual(run(importer, ["--source", source(directory), "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", webSha]).status, 0)
  assert.notEqual(run(importer, ["--unknown"]).status, 0)
  assert.notEqual(run(importer, ["--source", source(directory), "--source", source(directory), "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", webSha, "--output", path.join(directory, "lock.json")]).status, 0)
  assert.notEqual(run(checker, ["--lock"]).status, 0)
})

test("importer rejects source and output resolving to the same file", () => {
  const directory = fixture()
  const manifest = source(directory)
  const result = run(importer, ["--source", manifest, "--source-repository", "AquilaXk/aquila-blog-web", "--source-commit", webSha, "--output", path.join(directory, ".", "manifest.json")])
  assert.notEqual(result.status, 0)
})
