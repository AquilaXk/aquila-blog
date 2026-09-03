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

const isBackendFile = (file) =>
  file === "restore-privacy-gate.sh" ||
  file.startsWith("back/") ||
  file.startsWith("deploy/")

const isPlatformFile = (file) =>
  isBackendFile(file) ||
  file.startsWith("perf/") ||
  file.startsWith("infra/") ||
  file.startsWith("contracts/public-api/") ||
  file.startsWith("contracts/web/") ||
  file.startsWith("tools/") ||
  file.startsWith(".github/workflows/") ||
  file.startsWith(".githooks/") ||
  [".coderabbit.yaml", ".github/dependabot.yml", "sonar-project.properties"].includes(file)

const isPipelineFile = (file) =>
  file.startsWith(".github/workflows/") ||
  file.startsWith("tools/ci/") ||
  file === "back/Dockerfile"

const isMigrationFile = (file) =>
  /^back\/src\/main\/resources\/db\/migration\/.+\.sql$/.test(file) ||
  /^back\/src\/main\/kotlin\/db\/migration\/V[0-9]{8}_[0-9]{2}__[A-Za-z0-9_]+\.kt$/.test(file)

const extendedRules = [
  { reason: "security-or-auth", pattern: /(^|[/_.-])(security|authorization|oauth|auth(?!or)|session|cookie|csrf|cors)/i },
  { reason: "storage", pattern: /(storage|upload|cloud|minio|s3)/i },
  { reason: "task-or-worker", pattern: /(task|outbox|worker|scheduler|queue)/i },
  { reason: "deploy", pattern: /^(?:deploy\/|.*(?:docker-compose|Caddyfile))/i },
  { reason: "workflow", pattern: /^\.github\/workflows\// },
  { reason: "dockerfile", pattern: /(^|\/)Dockerfile$/ },
  {
    reason: "migration",
    pattern:
      /^(?:back\/src\/main\/resources\/db\/migration\/.+\.sql|back\/src\/main\/kotlin\/db\/migration\/V[0-9]{8}_[0-9]{2}__[A-Za-z0-9_]+\.kt)$/,
  },
]

const loadMigrationSafety = (path) => {
  if (!path) return null
  const report = JSON.parse(readFileSync(path, "utf8"))
  const valid =
    report !== null &&
    typeof report === "object" &&
    !Array.isArray(report) &&
    report.version === 2 &&
    typeof report.ok === "boolean" &&
    typeof report.blocked === "boolean" &&
    report.ok === !report.blocked &&
    Array.isArray(report.checkedFiles) &&
    Array.isArray(report.findings) &&
    Array.isArray(report.classifications) &&
    typeof report.runNMinusOne === "boolean" &&
    typeof report.frameworkChanged === "boolean"
  if (!valid) throw new Error("Invalid migration safety report")
  return report
}

const classifyScope = (files) => {
  if (files.length > 0 && files.every(isDocsFile)) return "docs-only"

  const platformFiles = files.filter(isPlatformFile)
  if (platformFiles.length === 0) return "non-platform"

  return platformFiles.every(isBackendFile) ? "backend-only" : "platform"
}

const classify = ({ files, migrationSafety }) => {
  const reasons = []
  const changeScope = classifyScope(files)
  const platformFiles = files.filter(isPlatformFile)

  if (changeScope === "docs-only") {
    return {
      version: 1,
      changedFiles: files,
      changeScope,
      riskProfile: "standard",
      deployBackend: false,
      reasons: ["docs-only"],
      runNMinusOne: migrationSafety?.runNMinusOne === true,
      frameworkChanged: migrationSafety?.frameworkChanged === true,
    }
  }
  if (platformFiles.some(isBackendFile)) reasons.push("backend")
  if (platformFiles.some(isPipelineFile)) reasons.push("pipeline")
  if (platformFiles.some(isMigrationFile)) reasons.push("migration")

  for (const { reason, pattern } of extendedRules) {
    if (platformFiles.some((file) => pattern.test(file)) && !reasons.includes(reason)) {
      reasons.push(reason)
    }
  }

  let riskProfile = reasons.some((reason) =>
    ["security-or-auth", "storage", "task-or-worker", "deploy", "workflow", "dockerfile", "migration", "pipeline"].includes(reason),
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
    deployBackend: platformFiles.some(isBackendFile),
    reasons,
    runNMinusOne: migrationSafety?.runNMinusOne === true,
    frameworkChanged: migrationSafety?.frameworkChanged === true,
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
      `release_run_n_minus_one=${result.runNMinusOne}`,
      `release_framework_changed=${result.frameworkChanged}`,
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
