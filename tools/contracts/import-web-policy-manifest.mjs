#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const fail = (message) => { console.error(`[web-policy-lock] ${message}`); process.exit(1) }
const values = {}
const known = new Set(["--source", "--output", "--source-repository", "--source-commit"])
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index]
  if (!known.has(argument) || values[argument] || !args[index + 1] || args[index + 1].startsWith("--")) fail("invalid arguments")
  values[argument] = args[++index]
}
const source = values["--source"]
const output = values["--output"]
const sourceRepository = values["--source-repository"]
const sourceCommit = values["--source-commit"]
if (!source || !output || !sourceRepository || !sourceCommit) fail("--source, --output, --source-repository, and --source-commit are required")
if (path.resolve(source) === path.resolve(output)) fail("source and output must be different paths")
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) fail("sourceCommit must be 40 lowercase hex")
if (sourceRepository !== "AquilaXk/aquila-blog-web") fail("sourceRepository must be AquilaXk/aquila-blog-web")
const bytes = fs.readFileSync(source)
let manifest
try { manifest = JSON.parse(bytes) } catch { fail("source is not JSON") }
const canonical = `${JSON.stringify(manifest, null, 2)}\n`
if (bytes.toString("utf8") !== canonical) fail("source bytes are not canonical manifest JSON")
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
if (!exactKeys(manifest, ["version", "contract", "active"]) || manifest.version !== 1 || manifest.contract !== "aquila-public-legal-policies" || !exactKeys(manifest.active, ["terms", "privacy", "cookies"])) fail("invalid canonical manifest shape")
for (const name of ["terms", "privacy", "cookies"]) {
  const item = manifest.active[name]
  if (!exactKeys(item, ["version", "contentSha256"]) || !/^\d+\.\d+\.\d+$/.test(item.version) || !/^[a-f0-9]{64}$/.test(item.contentSha256)) fail(`invalid ${name} identity`)
}
const lock = { ...manifest, sourceRepository, sourceCommit, manifestSha256: crypto.createHash("sha256").update(bytes).digest("hex") }
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(lock, null, 2)}\n`)
