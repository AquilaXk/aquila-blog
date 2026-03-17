import fs from "node:fs"
import path from "node:path"

const cwd = process.cwd()
const nextDir = path.join(cwd, ".next")
const manifestPath = path.join(nextDir, "build-manifest.json")
const budgetKb = Number(process.env.BUNDLE_BUDGET_KB || 480)

if (!fs.existsSync(manifestPath)) {
  console.error("[bundle-size] build-manifest.json not found. Run `yarn build` first.")
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
const homeFiles = manifest.pages?.["/"] ?? []
const appFiles = manifest.pages?.["/_app"] ?? []

const jsFiles = [...new Set([...homeFiles, ...appFiles].filter((file) => file.endsWith(".js")))]
if (jsFiles.length === 0) {
  console.error("[bundle-size] No home route JS chunks were found in build manifest.")
  process.exit(1)
}

let totalBytes = 0
for (const file of jsFiles) {
  const absolutePath = path.join(nextDir, file)
  if (!fs.existsSync(absolutePath)) continue
  totalBytes += fs.statSync(absolutePath).size
}

const totalKb = totalBytes / 1024
console.log(`[bundle-size] home initial JS: ${totalKb.toFixed(1)}KB (budget: ${budgetKb}KB)`)

if (totalKb > budgetKb) {
  console.error(`[bundle-size] budget exceeded: ${totalKb.toFixed(1)}KB > ${budgetKb}KB`)
  process.exit(1)
}
