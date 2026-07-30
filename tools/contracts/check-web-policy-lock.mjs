#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const fail = (message) => { console.error(`[web-policy-lock] ${message}`); process.exit(1) }
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--lock" || !args[1] || args[1].startsWith("--"))) fail("expected optional --lock <path>")
const lockPath = args.length === 2 ? args[1] : path.resolve(import.meta.dirname, "../../contracts/web/legal-policy-manifest.lock.json")
const bytes = fs.readFileSync(lockPath)
let lock
try { lock = JSON.parse(bytes) } catch { fail("lock is not JSON") }
if (bytes.toString("utf8") !== `${JSON.stringify(lock, null, 2)}\n`) fail("lock bytes are not canonical JSON")
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
if (!exactKeys(lock, ["version", "contract", "active", "sourceRepository", "sourceCommit", "manifestSha256"]) || lock.version !== 1 || lock.contract !== "aquila-public-legal-policies" || !exactKeys(lock.active, ["terms", "privacy", "cookies"])) fail("invalid lock shape")
if (lock.sourceRepository !== "AquilaXk/aquila-blog-web" && lock.sourceRepository !== "AquilaXk/aquila-blog") fail("unauthorized sourceRepository")
if (!/^[a-f0-9]{40}$/.test(lock.sourceCommit)) fail("sourceCommit must be 40 lowercase hex")
if (!/^[a-f0-9]{64}$/.test(lock.manifestSha256)) fail("manifestSha256 must be 64 lowercase hex")
const manifest = { version: lock.version, contract: lock.contract, active: lock.active }
for (const name of ["terms", "privacy", "cookies"]) {
  const item = manifest.active[name]
  if (!exactKeys(item, ["version", "contentSha256"]) || !/^\d+\.\d+\.\d+$/.test(item.version) || !/^[a-f0-9]{64}$/.test(item.contentSha256)) fail(`invalid ${name} identity`)
}
const actual = crypto.createHash("sha256").update(`${JSON.stringify(manifest, null, 2)}\n`).digest("hex")
if (lock.manifestSha256 !== actual) fail("manifestSha256 mismatch")
console.log("[web-policy-lock] ok")
