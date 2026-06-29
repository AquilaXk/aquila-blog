#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const seedConfigFiles = [
  "back/src/main/kotlin/com/back/boundedContexts/member/adapter/bootstrap/MemberNotProdInitData.kt",
  "back/src/main/kotlin/com/back/boundedContexts/post/adapter/bootstrap/PostNotProdInitData.kt",
]
const forbiddenRuntimeTargets = [
  ".github/workflows",
  "deploy",
  "back/src/main/resources/application.yaml",
  "back/src/main/resources/application-prod.yaml",
]
const forbiddenRuntimePatterns = [
  /admin@test\.com/,
  /system@test\.com/,
  /holding@test\.com/,
  /user[0-9]+@test\.com/,
  /["']1234["']/,
  /제목 1/,
  /비공개 글/,
]

const readTextFile = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8")

const walk = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath)
  const stat = statSync(absolutePath)
  if (!stat.isDirectory()) return [relativePath]

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relativePath, entry.name)
    if (entry.isDirectory()) return walk(child)
    return child
  })
}

const fail = (message) => {
  console.error(`[demo-seed-prod-gate] ${message}`)
  process.exitCode = 1
}

for (const relativePath of seedConfigFiles) {
  const source = readTextFile(relativePath)
  if (source.includes('@Profile("!prod")')) fail(`${relativePath} must not use @Profile("!prod")`)
  if (!source.includes("DemoSeedDataCondition")) fail(`${relativePath} must use DemoSeedDataCondition`)
}

for (const relativePath of forbiddenRuntimeTargets.flatMap(walk)) {
  if (!/\.(ya?ml|json|sh|mjs|md|properties)$/.test(relativePath)) continue
  const source = readTextFile(relativePath)
  for (const pattern of forbiddenRuntimePatterns) {
    if (pattern.test(source)) fail(`${relativePath} contains forbidden demo seed trace: ${pattern}`)
  }
}

if (!process.exitCode) {
  console.log("[demo-seed-prod-gate] ok")
}
