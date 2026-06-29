#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const controlsPath = path.resolve(
  repoRoot,
  process.env.PRIVACY_LAUNCH_CONTROLS_PATH || "legal/privacy-launch-controls.json",
)
const checklistPath = path.resolve(
  repoRoot,
  process.env.PRIVACY_LAUNCH_CHECKLIST_PATH || "docs/design/privacy-launch-gate-checklist.md",
)

const fail = (message) => {
  console.error(`[privacy-launch-gate] ${message}`)
  process.exitCode = 1
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"))
const readText = (filePath) => fs.readFileSync(filePath, "utf8")
const normalizeCell = (value) => value.trim()

const parseIssueMatrix = (markdown) => {
  const rows = new Map()
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("| #")) continue
    const cells = line.split("|").slice(1, -1).map(normalizeCell)
    if (cells.length !== 6) continue
    const issue = Number(cells[0].replace(/^#/, ""))
    if (!Number.isInteger(issue)) continue
    rows.set(issue, {
      issue,
      status: cells[1],
      category: cells[2],
      target: cells[3],
      evidenceRequirement: cells[4],
      launchDecision: cells[5],
    })
  }
  return rows
}

const requireNonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} is required`)
  }
}

const requireStringArray = (value, label) => {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must contain at least one evidence reference`)
    return
  }
  value.forEach((entry, index) => requireNonEmptyString(entry, `${label}[${index}]`))
}

const validateControl = (control) => {
  const label = `#${control.issue}`
  if (!Number.isInteger(control.issue)) fail(`${label} issue must be an integer`)
  if (control.status !== "Open" && control.status !== "Closed") {
    fail(`${label} status must be Open or Closed`)
  }
  requireNonEmptyString(control.category, `${label} category`)
  requireNonEmptyString(control.target, `${label} target`)
  requireNonEmptyString(control.evidenceRequirement, `${label} evidenceRequirement`)
  requireNonEmptyString(control.launchDecision, `${label} launchDecision`)
  requireStringArray(control.evidenceArtifacts, `${label} evidenceArtifacts`)

  if (control.status === "Open" && control.launchDecision !== "차단") {
    fail(`${label} open control must block launch`)
  }
  if (control.status === "Closed" && control.launchDecision === "차단") {
    fail(`${label} closed control must not block launch`)
  }
  if (control.disabledByFlag === true) {
    requireStringArray(control.disabledEvidence, `${label} disabledEvidence`)
  }
}

const assertChecklistRowMatches = (control, row) => {
  const label = `#${control.issue}`
  if (!row) {
    fail(`${label} is missing from checklist matrix`)
    return
  }
  for (const key of ["status", "category", "target", "evidenceRequirement", "launchDecision"]) {
    if (row[key] !== control[key]) {
      fail(`${label} checklist ${key} drift: expected "${control[key]}", actual "${row[key]}"`)
    }
  }
}

const source = readJson(controlsPath)
const checklist = readText(checklistPath)
const matrixRows = parseIssueMatrix(checklist)

if (source.version !== 1) fail("source version must be 1")
if (!source.releaseLinkage || typeof source.releaseLinkage !== "object") {
  fail("releaseLinkage is required")
} else {
  requireNonEmptyString(source.releaseLinkage.policyEffectiveDateSource, "releaseLinkage.policyEffectiveDateSource")
  requireNonEmptyString(source.releaseLinkage.deployShaSource, "releaseLinkage.deployShaSource")
  requireStringArray(source.releaseLinkage.evidenceArtifacts, "releaseLinkage.evidenceArtifacts")
}

if (!Array.isArray(source.controls) || source.controls.length === 0) {
  fail("controls must contain at least one control")
} else {
  const seen = new Set()
  for (const control of source.controls) {
    if (seen.has(control.issue)) fail(`#${control.issue} is duplicated`)
    seen.add(control.issue)
    validateControl(control)
    assertChecklistRowMatches(control, matrixRows.get(control.issue))
  }

  for (const issue of matrixRows.keys()) {
    if (!seen.has(issue)) fail(`#${issue} exists in checklist matrix but not structured source`)
  }
}

if (process.exitCode) process.exit(process.exitCode)
console.log(`[privacy-launch-gate] ok: ${source.controls.length} controls verified`)
