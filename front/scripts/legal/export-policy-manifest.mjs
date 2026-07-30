#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { validatePublicPolicies } from "./validate-public-policies.mjs"

const root = path.resolve(import.meta.dirname, "../..")
const args = process.argv.slice(2)
let output = path.join(root, "contracts/export/legal-policy-manifest.json")
let check = false
let outputSet = false
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--check" && !check) check = true
  else if (args[index] === "--output" && !outputSet && args[index + 1] && !args[index + 1].startsWith("--")) { outputSet = true; output = path.resolve(args[++index]) }
  else { console.error("[legal-policies] expected optional --check and --output <path>"); process.exit(1) }
}
const expected = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`
const result = validatePublicPolicies()
if (!result.ok) {
  for (const error of result.errors) console.error(`[legal-policies] ${error}`)
  process.exit(1)
}
const bytes = expected(result.manifest)
if (check) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== bytes) {
    console.error("[legal-policies] canonical manifest is missing or stale")
    process.exit(1)
  }
  console.log(`[legal-policies] verified ${path.relative(root, output)}`)
  process.exit(0)
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, bytes)
console.log(`[legal-policies] wrote ${path.relative(root, output)}`)
