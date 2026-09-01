#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const policyFile = "back/config/flyway-compatibility-policy.json"
const supportedClasses = new Set(["EXPAND_SAFE", "CONTRACT_AFTER_CUTOVER", "REQUIRES_N_MINUS_1_TEST"])
const frameworkFiles = new Set([
  "tools/ci/check-flyway-deploy-safety.mjs",
  "tools/ci/classify-release.mjs",
  ".github/workflows/reusable-backend-quality.yml",
  "back/src/test/kotlin/com/back/infrastructure/FlywayNMinusOneCompatibilityTestcontainersIntegrationTest.kt",
  "tools/test/flyway-deploy-safety.test.mjs",
])

const parseArgs = (argv) => {
  const args = { json: false, repoRoot: process.cwd() }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") args.json = true
    else if (arg === "--repo-root") args.repoRoot = argv[++index]
    else if (arg === "--changed-files") args.changedFiles = argv[++index]
    else if (arg === "--policy") args.policy = argv[++index]
    else if (arg === "--base-policy") args.basePolicy = argv[++index]
    else if (arg === "--output") args.output = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.changedFiles) throw new Error("--changed-files is required")
  return args
}

const readChangedFiles = (file) =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

const isMigrationFile = (file) => /^back\/src\/main\/resources\/db\/migration\/.+\.sql$/.test(file)
const isVersionedMigration = (file) => /^back\/src\/main\/resources\/db\/migration\/V.+\.sql$/.test(file)
const isProceduralBodyPrefix = (statement) =>
  /\bdo\s+(?:language\s+[a-z_][a-z0-9_]*\s+)?$/i.test(statement) || /\bas\s*$/i.test(statement)

const stripCommentsAndStrings = (sql, options = {}) => {
  const inspectStringLiterals = options.inspectStringLiterals === true
  let output = ""
  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index]
    const next = sql[index + 1]

    if (current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1
      output += "\n"
      continue
    }

    if (current === "/" && next === "*") {
      index += 2
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1
      index += 1
      output += " "
      continue
    }

    if (current === "$") {
      const rest = sql.slice(index)
      const delimiter = rest.match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0]
      if (delimiter) {
        const closeIndex = sql.indexOf(delimiter, index + delimiter.length)
        if (closeIndex !== -1) {
          const currentStatement = output.slice(output.lastIndexOf(";") + 1)
          const isProceduralBody = isProceduralBodyPrefix(currentStatement)
          const body = sql.slice(index + delimiter.length, closeIndex)
          index = closeIndex + delimiter.length - 1
          if (isProceduralBody || inspectStringLiterals) {
            output += ` ${stripCommentsAndStrings(body, { inspectStringLiterals: true })} `
          } else {
            output += " "
          }
          continue
        }
      }
    }

    if ((current === "E" || current === "e") && next === "'") {
      const currentStatement = output.slice(output.lastIndexOf(";") + 1)
      const isProceduralBody = isProceduralBodyPrefix(currentStatement)
      const captureLiteral = isProceduralBody || inspectStringLiterals
      index += 2
      let literal = ""
      while (index < sql.length) {
        if (sql[index] === "\\") {
          if (captureLiteral && index + 1 < sql.length) literal += sql[index + 1]
          index += 2
          continue
        }
        if (sql[index] === "'" && sql[index + 1] === "'") {
          if (captureLiteral) literal += "'"
          index += 2
          continue
        }
        if (sql[index] === "'") break
        if (captureLiteral) literal += sql[index]
        index += 1
      }
      if (captureLiteral) {
        output += ` ${stripCommentsAndStrings(literal, { inspectStringLiterals: true })} `
      } else {
        output += " "
      }
      continue
    }

    if (current === "'") {
      const currentStatement = output.slice(output.lastIndexOf(";") + 1)
      const isProceduralBody = isProceduralBodyPrefix(currentStatement)
      const captureLiteral = isProceduralBody || inspectStringLiterals
      index += 1
      let literal = ""
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          if (captureLiteral) literal += "'"
          index += 2
          continue
        }
        if (sql[index] === "'") break
        if (captureLiteral) literal += sql[index]
        index += 1
      }
      if (captureLiteral) {
        output += ` ${stripCommentsAndStrings(literal, { inspectStringLiterals: true })} `
      } else {
        output += " "
      }
      continue
    }

    output += current
  }
  return output
}

const destructiveRules = [
  { rule: "drop-table", pattern: /\bdrop\s+table\b/i },
  { rule: "drop-schema", pattern: /\bdrop\s+schema\b/i },
  { rule: "drop-schema-object", pattern: /\bdrop\s+(?:database|domain|extension|function|materialized\s+view|procedure|sequence|trigger|type|view)\b/i },
  { rule: "drop-column", pattern: /\balter\s+table\b[^;]*?\bdrop\s+(?:column\s+)?(?!constraint\b|not\b|default\b)[a-zA-Z_"]/i },
  { rule: "truncate-table", pattern: /(?:^|;|\bbegin\b|\bthen\b|\belse\b|\bloop\b|\bexecute\b)\s*truncate\s+(?:table\s+)?\b/i },
  { rule: "rename-table", pattern: /\balter\s+table\b[^;]*?\brename\s+to\b/i },
  { rule: "rename-column", pattern: /\balter\s+table\b[^;]*?\brename\s+(?:column\s+)?(?!constraint\b|to\b)[^;]*?\bto\b/i },
  { rule: "alter-column-type", pattern: /\balter\s+table\b[^;]*?\balter\s+(?:column\s+)?[^;]*?\btype\b/i },
  { rule: "set-not-null", pattern: /\balter\s+table\b[^;]*?\balter\s+(?:column\s+)?[^;]*?\bset\s+not\s+null\b/i },
]

const inspectFile = ({ repoRoot, file }) => {
  const fullPath = path.join(repoRoot, file)
  if (!existsSync(fullPath)) return [{ file, rule: "missing-migration-file" }]
  const stripped = stripCommentsAndStrings(readFileSync(fullPath, "utf8"))
  return destructiveRules
    .filter(({ pattern }) => pattern.test(stripped))
    .map(({ rule }) => ({ file, rule }))
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const isBoundedText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max
const hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key))
const hasSameCutoverEvidence = (current, base) =>
  current.repository === base.repository && current.mergeSha === base.mergeSha && current.deployRunId === base.deployRunId

const loadPolicy = (file) => {
  if (!file) return null
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}

const validatePolicy = ({ policy, repoRoot, checkMigrationFiles }) => {
  if (!isPlainObject(policy) || policy.version !== 1 || !Array.isArray(policy.migrations) || !Array.isArray(policy.cutovers)) {
    return { error: "invalid-compatibility-policy" }
  }
  const migrations = new Map()
  for (const entry of policy.migrations) {
    if (
      !isPlainObject(entry) ||
      !hasOnlyKeys(entry, ["file", "class", "cutoverEvidenceId"]) ||
      !isBoundedText(entry.file, 240) ||
      !isVersionedMigration(entry.file) ||
      !supportedClasses.has(entry.class)
    ) {
      return { error: "invalid-compatibility-policy" }
    }
    if (migrations.has(entry.file)) return { error: "duplicate-compatibility-migration" }
    if (entry.class === "CONTRACT_AFTER_CUTOVER") {
      if (!isBoundedText(entry.cutoverEvidenceId, 120)) return { error: "invalid-compatibility-policy" }
    } else if ("cutoverEvidenceId" in entry) {
      return { error: "invalid-compatibility-policy" }
    }
    if (checkMigrationFiles && !existsSync(path.join(repoRoot, entry.file))) return { error: "policy-migration-file-missing", file: entry.file }
    migrations.set(entry.file, entry)
  }
  const cutovers = new Map()
  for (const entry of policy.cutovers) {
    if (
      !isPlainObject(entry) ||
      !hasOnlyKeys(entry, ["id", "repository", "mergeSha", "deployRunId"]) ||
      !isBoundedText(entry.id, 120) ||
      entry.repository !== "AquilaXk/aquila-blog" ||
      !/^[a-f0-9]{40}$/.test(entry.mergeSha) ||
      !Number.isSafeInteger(entry.deployRunId) ||
      entry.deployRunId <= 0
    ) {
      return { error: "invalid-compatibility-policy" }
    }
    if (cutovers.has(entry.id)) return { error: "duplicate-cutover-evidence" }
    cutovers.set(entry.id, entry)
  }
  return { migrations, cutovers }
}

const main = () => {
  const args = parseArgs(process.argv.slice(2))
  const changedFiles = readChangedFiles(args.changedFiles)
  const checkedFiles = changedFiles.filter(isMigrationFile)
  const currentPolicy = validatePolicy({ policy: loadPolicy(args.policy), repoRoot: args.repoRoot, checkMigrationFiles: true })
  const basePolicy = validatePolicy({ policy: loadPolicy(args.basePolicy), repoRoot: args.repoRoot, checkMigrationFiles: false })
  const findings = []
  const classifications = []

  if (
    args.policy &&
    currentPolicy.error &&
    !(currentPolicy.error === "policy-migration-file-missing" && checkedFiles.includes(currentPolicy.file))
  ) {
    findings.push({ rule: currentPolicy.error, ...(currentPolicy.file ? { file: currentPolicy.file } : {}) })
  }
  if (args.basePolicy && basePolicy.error) findings.push({ rule: basePolicy.error, ...(basePolicy.file ? { file: basePolicy.file } : {}) })

  if (!currentPolicy.error && !basePolicy.error) {
    for (const [cutoverEvidenceId, baseCutover] of basePolicy.cutovers) {
      const currentCutover = currentPolicy.cutovers.get(cutoverEvidenceId)
      if (!currentCutover) {
        findings.push({ cutoverEvidenceId, rule: "cutover-evidence-removed-from-base-policy" })
      } else if (!hasSameCutoverEvidence(currentCutover, baseCutover)) {
        findings.push({ cutoverEvidenceId, rule: "cutover-evidence-changed-from-base-policy" })
      }
    }
  }

  for (const file of checkedFiles) {
    const destructive = inspectFile({ repoRoot: args.repoRoot, file })
    if (destructive.some(({ rule }) => rule === "missing-migration-file")) {
      findings.push(...destructive)
      continue
    }
    if (!isVersionedMigration(file)) {
      findings.push(...destructive)
      continue
    }
    const entry = currentPolicy.migrations?.get(file)
    if (!entry) {
      findings.push({ file, rule: "missing-compatibility-class" })
      continue
    }
    classifications.push({ file, class: entry.class, ...(entry.cutoverEvidenceId ? { cutoverEvidenceId: entry.cutoverEvidenceId } : {}) })
    if (entry.class !== "CONTRACT_AFTER_CUTOVER") {
      findings.push(...destructive)
      continue
    }
    const currentCutover = currentPolicy.cutovers?.get(entry.cutoverEvidenceId)
    const baseCutover = basePolicy.cutovers?.get(entry.cutoverEvidenceId)
    if (!currentCutover || !baseCutover) {
      findings.push({ file, rule: "cutover-evidence-not-in-base-policy" })
    }
  }

  const runNMinusOne = classifications.some(({ class: classification }) =>
    classification === "CONTRACT_AFTER_CUTOVER" || classification === "REQUIRES_N_MINUS_1_TEST",
  )
  const result = {
    version: 2,
    ok: findings.length === 0,
    blocked: findings.length > 0,
    checkedFiles,
    findings,
    classifications,
    runNMinusOne,
    frameworkChanged: changedFiles.some((file) => frameworkFiles.has(file)),
  }
  const output = `${JSON.stringify(result, null, 2)}\n`

  if (args.output) writeFileSync(args.output, output)

  if (args.json) process.stdout.write(output)
  else if (result.blocked) {
    for (const finding of findings) {
      process.stderr.write(`destructive migration blocked: ${finding.file ?? policyFile} ${finding.rule}\n`)
    }
  } else {
    process.stdout.write(`Flyway deploy safety passed: ${checkedFiles.length} migration files checked\n`)
  }

  process.exit(result.blocked ? 1 : 0)
}

main()
