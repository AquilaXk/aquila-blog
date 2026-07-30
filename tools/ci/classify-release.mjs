#!/usr/bin/env node
import { readFileSync, appendFileSync } from "node:fs"

const parseArgs = (argv) => {
  const args = { json: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") args.json = true
    else if (arg === "--changed-files") args.changedFiles = argv[++index]
    else if (arg === "--migration-safety-json") args.migrationSafetyJson = argv[++index]
    else if (arg === "--github-output") args.githubOutput = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

const readChangedFiles = (args) => {
  const text = args.changedFiles ? readFileSync(args.changedFiles, "utf8") : readFileSync(0, "utf8")
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
}

const isDocsFile = (file) =>
  file.startsWith("docs/") ||
  ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "CURSOR.md", "COPILOT.md", "README.md"].includes(file)

const isFrontendFile = (file) => file.startsWith("front/")

const isBackendFile = (file) =>
  file.startsWith("back/") ||
  file.startsWith("deploy/homeserver/")

const isPipelineFile = (file) =>
  file.startsWith(".github/workflows/") ||
  file.startsWith("tools/ci/") ||
  file === "back/Dockerfile" ||
  file === "front/Dockerfile"

const isMigrationFile = (file) => /^back\/src\/main\/resources\/db\/migration\/.+\.sql$/.test(file)

const extendedRules = [
  { reason: "security-or-auth", pattern: /(^|[/_.-])(security|authorization|oauth|auth(?!or)|session|cookie|csrf|cors)/i },
  { reason: "storage", pattern: /(storage|upload|cloud|minio|s3)/i },
  { reason: "task-or-worker", pattern: /(task|outbox|worker|scheduler|queue)/i },
  { reason: "deploy", pattern: /^(?:deploy\/|.*(?:docker-compose|Caddyfile))/i },
  { reason: "workflow", pattern: /^\.github\/workflows\// },
  { reason: "dockerfile", pattern: /(^|\/)Dockerfile$/ },
  { reason: "migration", pattern: /^back\/src\/main\/resources\/db\/migration\/.+\.sql$/ },
]

const loadMigrationSafety = (path) => {
  if (!path) return null
  return JSON.parse(readFileSync(path, "utf8"))
}

const classifyScope = (files) => {
  if (files.length > 0 && files.every(isDocsFile)) return "docs-only"

  const hasBackend = files.some(isBackendFile)
  const hasFrontend = files.some(isFrontendFile)
  const hasPipeline = files.some(isPipelineFile)

  if (hasBackend && !hasFrontend && !hasPipeline) return "backend-only"
  if (hasFrontend && !hasBackend && !hasPipeline) return "frontend-only"
  return "mixed"
}

const classify = ({ files, migrationSafety }) => {
  const reasons = []
  const changeScope = classifyScope(files)

  if (changeScope === "docs-only") {
    return {
      version: 1,
      changedFiles: files,
      changeScope,
      riskProfile: "standard",
      deployBackend: false,
      verifyFrontend: false,
      reasons: ["docs-only"],
    }
  }
  if (files.some(isBackendFile)) reasons.push("backend")
  if (files.some(isFrontendFile)) reasons.push("frontend")
  if (files.some(isPipelineFile)) reasons.push("pipeline")
  if (files.some(isMigrationFile)) reasons.push("migration")
  if (files.some(isBackendFile) && files.some(isFrontendFile)) reasons.push("backend-and-frontend")

  for (const { reason, pattern } of extendedRules) {
    if (files.some((file) => pattern.test(file)) && !reasons.includes(reason)) {
      reasons.push(reason)
    }
  }

  let riskProfile = reasons.some((reason) =>
    ["security-or-auth", "storage", "task-or-worker", "deploy", "workflow", "dockerfile", "migration", "backend-and-frontend", "pipeline"].includes(reason),
  )
    ? "extended"
    : "standard"

  if (changeScope === "docs-only") riskProfile = "standard"

  if (migrationSafety?.blocked) {
    riskProfile = "blocked"
    if (!reasons.includes("destructive-migration")) reasons.push("destructive-migration")
  }

  return {
    version: 1,
    changedFiles: files,
    changeScope,
    riskProfile,
    deployBackend: changeScope === "backend-only" || changeScope === "mixed",
    verifyFrontend: changeScope === "frontend-only" || changeScope === "mixed",
    reasons,
  }
}

const writeGithubOutput = (path, result) => {
  if (!path) return
  appendFileSync(
    path,
    [
      `release_change_scope=${result.changeScope}`,
      `release_risk_profile=${result.riskProfile}`,
      `release_deploy_backend=${result.deployBackend}`,
      `release_verify_frontend=${result.verifyFrontend}`,
      "",
    ].join("\n"),
  )
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const result = classify({
    files: readChangedFiles(args),
    migrationSafety: loadMigrationSafety(args.migrationSafetyJson),
  })

  writeGithubOutput(args.githubOutput, result)

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }

  process.stdout.write(`release change_scope=${result.changeScope} risk_profile=${result.riskProfile}\n`)
}

main()
