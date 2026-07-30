#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { validatePublicPolicies } from "./validate-public-policies.mjs"

const root = path.resolve(import.meta.dirname, "../..")
const output = path.join(root, "contracts/export/legal-policy-manifest.json")
const result = validatePublicPolicies()
if (!result.ok) {
  for (const error of result.errors) console.error(`[legal-policies] ${error}`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(result.manifest, null, 2)}\n`)
console.log(`[legal-policies] wrote ${path.relative(root, output)}`)
