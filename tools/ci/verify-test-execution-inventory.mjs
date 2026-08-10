import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const kinds = new Set(["direct-ci", "indirect", "scheduled", "manual", "fixture-only"])
const args = process.argv.slice(2)
const failures = []
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  if (index === args.length - 1 || args[index + 1].startsWith("--")) {
    failures.push(`${name} requires a value`)
    return fallback
  }
  return args[index + 1]
}
const root = path.resolve(option("--root", "."))
const inventoryPath = path.resolve(root, option("--inventory", "tools/test/test-execution-inventory.json"))

function fail(message) { failures.push(message) }
function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object || {}, key) }
function relative(file) { return path.relative(root, file).split(path.sep).join("/") }
function exists(file) { return existsSync(path.resolve(root, file)) }
function files(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? files(file) : [file]
  })
}
function yaml(file) {
  try {
    const output = execFileSync("ruby", ["-rpsych", "-rjson", "-e", "puts JSON.generate(Psych.safe_load(File.read(ARGV[0]), aliases: true))", file], { encoding: "utf8" })
    return JSON.parse(output)
  } catch (error) {
    fail(`workflow YAML cannot be parsed structurally: ${relative(file)} (${error.message.split("\n")[0]})`)
    return null
  }
}
function workflow(entry) {
  const file = path.resolve(root, entry.workflow || "")
  if (!entry.workflow || !existsSync(file)) { fail(`${entry.path}: missing workflow ${entry.workflow || ""}`); return null }
  const data = yaml(file)
  if (!data) return null
  const job = data.jobs?.[entry.job]
  if (!entry.job || !job) { fail(`${entry.path}: missing job ${entry.job || ""}`); return null }
  if (String(job.if).trim() === "false") fail(`${entry.path}: job ${entry.job} is if: false`)
  const step = (job.steps || []).find((candidate) => candidate.name === entry.step)
  if (!entry.step || !step) { fail(`${entry.path}: missing step ${entry.step || ""}`); return null }
  if (String(step.if).trim() === "false") fail(`${entry.path}: step ${entry.step} is if: false`)
  return { data, job, step }
}
function simpleCommand(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#") || /[|&;<>`]|\$\(|#/.test(trimmed)) return null
  return trimmed.split(/\s+/)
}
function invokes(run, target) {
  const script = String(run || "")
  if (/(^|\n)\s*(if|then|elif|else|fi|for|while|until|do|done|case|esac|function)\b|(^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*\(\)\s*\{|<<-?\s*['"]?[A-Za-z_][A-Za-z0-9_]*/m.test(script)) return false
  return script.split("\n").some((line) => {
    const tokens = simpleCommand(line)
    if (!tokens) return false
    if (tokens[0] === "bash") return tokens[1] === target
    if (tokens[0] !== "node") return false
    return (tokens[1] === "--test" && tokens.slice(2).includes(target)) || tokens[1] === target
  })
}
function codeMarkerStarts(source, marker) {
  let quote = ""
  let block = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const next = source[index + 1]
    if (block) {
      if (character === "*" && next === "/") { block = false; index += 1 }
      continue
    }
    if (quote) {
      if (character === "\\") index += 1
      else if (character === quote) quote = ""
      continue
    }
    if (character === "'" || character === '"' || character === "`") { quote = character; continue }
    if (character === "/" && next === "*") { block = true; index += 1; continue }
    if (character === "/" && next === "/") { while (index < source.length && source[index] !== "\n") index += 1; continue }
    if (character === "#" && (index === 0 || /\s/.test(source[index - 1]))) { while (index < source.length && source[index] !== "\n") index += 1; continue }
    if (source.startsWith(marker, index)) return true
  }
  return false
}
function hasConsumerEvidence(entry) {
  if (!entry.consumer || !exists(entry.consumer)) return false
  if (typeof entry.binding !== "string" || !entry.binding.trim() || typeof entry.executor !== "string" || !entry.executor.trim()) return false
  const source = readFileSync(path.resolve(root, entry.consumer), "utf8")
  return codeMarkerStarts(source, entry.binding) && codeMarkerStarts(source, entry.executor)
}
function validateExecutable(entry, context, target = entry.command || entry.path) {
  if (!context?.step?.run || !invokes(context.step.run, target)) fail(`${entry.path}: step ${entry.step || ""} has no actual run for ${target}`)
}

if (!existsSync(inventoryPath)) {
  fail(`inventory is missing: ${relative(inventoryPath)}`)
} else {
  let inventory
  try { inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) } catch { fail(`inventory is invalid JSON: ${relative(inventoryPath)}`) }
  if (inventory?.version !== 1) fail(`inventory version must be exactly 1 (received ${inventory?.version ?? "missing"})`)
  const entries = inventory?.entries
  if (!Array.isArray(entries)) fail("inventory entries must be an array")
  if (Array.isArray(entries)) {
    const discovered = new Set(files(path.join(root, "tools/test")).map(relative).filter((file) =>
      /(?:\.test\.mjs|\.test\.sh|\.promtool-test\.yml)$/.test(file) || /\/verify-[^/]+\.sh$/.test(file),
    ))
    const seen = new Set()
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") { fail("inventory contains a non-object entry"); continue }
      if (!kinds.has(entry.kind)) fail(`${entry.path || "unknown"}: invalid kind ${entry.kind}`)
      if (seen.has(entry.path)) fail(`duplicate inventory path: ${entry.path}`)
      seen.add(entry.path)
      if (!discovered.has(entry.path)) fail(`stale inventory path: ${entry.path}`)
      const context = workflow(entry)
      if (entry.kind === "direct-ci" || entry.kind === "manual") validateExecutable(entry, context)
      if (entry.kind === "manual") {
        const triggers = context?.data?.on || context?.data?.true || {}
        if (context && !hasOwn(triggers, "workflow_dispatch")) fail(`${entry.path}: manual workflow requires workflow_dispatch`)
        if (typeof entry.reason !== "string" || !entry.reason.trim()) fail(`${entry.path}: manual entry requires documented reason`)
        if (typeof entry.evidence !== "string" || !entry.evidence.trim()) fail(`${entry.path}: manual entry requires documented evidence`)
      }
      if (entry.kind === "indirect") {
        if (!context?.step?.run || !invokes(context.step.run, entry.consumer)) fail(`${entry.path}: parent does not execute consumer ${entry.consumer || ""}`)
        if (!hasConsumerEvidence(entry)) fail(`${entry.path}: indirect consumer lacks non-comment binding and executor evidence`)
      }
      if (entry.kind === "fixture-only") {
        validateExecutable(entry, context, entry.consumer)
        if (!hasConsumerEvidence(entry)) fail(`${entry.path}: fixture consumer lacks non-comment binding and executor evidence`)
      }
      if (entry.kind === "scheduled") {
        const triggers = context?.data?.on || context?.data?.true || {}
        if (context && (!Array.isArray(triggers.schedule) || triggers.schedule.length === 0 || !hasOwn(triggers, "workflow_dispatch"))) fail(`${entry.path}: scheduled workflow requires schedule and workflow_dispatch`)
        validateExecutable(entry, context)
        const requiredArtifacts = ["restore-drill-summary.md", "restore-drill-result.env", "restore-privacy-gate.txt", "minio-checksums.sha256"]
        if (!Array.isArray(entry.artifacts) || requiredArtifacts.some((artifact) => !entry.artifacts.includes(artifact)) || entry.artifacts.length !== requiredArtifacts.length) {
          fail(`${entry.path}: scheduled entry requires the four restore-drill artifacts`)
        }
        const steps = context?.job?.steps || []
        const verifierIndex = steps.findIndex((candidate) => candidate.name === entry.step)
        const summaryIndex = steps.findIndex((candidate) => candidate.name === entry.summaryStep)
        const uploadIndex = steps.findIndex((candidate) => candidate.name === entry.uploadStep)
        if (!entry.summaryStep || summaryIndex < 0) fail(`${entry.path}: scheduled workflow lacks summary step ${entry.summaryStep || ""}`)
        if (!entry.uploadStep || uploadIndex < 0) fail(`${entry.path}: scheduled workflow lacks upload step ${entry.uploadStep || ""}`)
        if (verifierIndex < 0 || summaryIndex < 0 || uploadIndex < 0 || !(verifierIndex < summaryIndex && summaryIndex < uploadIndex)) fail(`${entry.path}: scheduled verifier, summary, and upload steps must be ordered`)
        const uploadStep = steps[uploadIndex]
        const summaryStep = steps[summaryIndex]
        if (summaryStep && hasOwn(summaryStep, "if")) fail(`${entry.path}: summary step must not override verifier success`)
        if (uploadStep && hasOwn(uploadStep, "if")) fail(`${entry.path}: upload step must not override verifier success`)
        if (!entry.summaryArtifact || !entry.summaryOutput || !String(summaryStep?.run || "").includes(entry.summaryArtifact) || !String(summaryStep?.run || "").includes(entry.summaryOutput)) fail(`${entry.path}: summary step must publish ${entry.summaryArtifact || "the restore summary"}`)
        if (uploadStep) {
          if (!/^actions\/upload-artifact@/.test(String(uploadStep.uses || ""))) fail(`${entry.path}: upload step must use actions/upload-artifact`)
          if (uploadStep.with?.path !== entry.artifactPath) fail(`${entry.path}: upload artifact path must be ${entry.artifactPath || ""}`)
          if (uploadStep.with?.["if-no-files-found"] !== "error") fail(`${entry.path}: upload step must set if-no-files-found to error`)
        }
      }
    }
    for (const file of discovered) if (!seen.has(file)) fail(`unclassified discovered test: ${file}`)
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`)
  process.exit(1)
}
console.log("PASS test execution inventory")
