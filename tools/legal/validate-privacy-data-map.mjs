#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const requiredActivityFields = [
  "id",
  "name",
  "dataCategories",
  "dataSubjects",
  "purpose",
  "legalBasis",
  "collectionSource",
  "requiredOrOptional",
  "systemOfRecord",
  "processors",
  "overseasTransfer",
  "retentionRule",
  "destructionMethod",
  "accessRoles",
  "encryption",
  "userRightsHandler",
  "codeOwner",
  "policySectionId",
  "enabledByEnv",
]
const requiredProcessorFields = [
  "id",
  "name",
  "role",
  "serviceType",
  "dataCategories",
  "region",
  "overseasTransfer",
  "enabledByEnv",
  "contractStatus",
  "retentionControl",
  "securityControls",
]
const requiredProcessors = new Set([
  "vercel_frontend_hosting",
  "cloudflare_dns_proxy",
  "kakao_oauth",
  "smtp_provider_unconfirmed",
  "google_gemini",
  "home_server_backup_storage",
])

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8")

const parseScalar = (value) => {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  return trimmed
}

const parseListYaml = (source, rootKey) => {
  const lines = source.split(/\r?\n/)
  const items = []
  let current = null
  let pendingListKey = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "")
    if (!line.trim() || line.trim().startsWith("#") || line.trim() === `${rootKey}:`) continue

    const itemMatch = line.match(/^  - ([A-Za-z0-9_]+):\s*(.*)$/)
    if (itemMatch) {
      if (current) items.push(current)
      current = { [itemMatch[1]]: parseScalar(itemMatch[2]) }
      pendingListKey = null
      continue
    }

    if (!current) continue

    const keyMatch = line.match(/^    ([A-Za-z0-9_]+):(?:\s*(.*))?$/)
    if (keyMatch) {
      const [, key, rawValue = ""] = keyMatch
      if (rawValue.trim()) {
        current[key] = parseScalar(rawValue)
        pendingListKey = null
      } else {
        current[key] = []
        pendingListKey = key
      }
      continue
    }

    const nestedItem = line.match(/^      -\s*(.*)$/)
    if (nestedItem && pendingListKey) {
      current[pendingListKey].push(parseScalar(nestedItem[1]))
    }
  }

  if (current) items.push(current)
  return items
}

const fail = (message) => {
  console.error(`[privacy-data-map] ${message}`)
  process.exitCode = 1
}

const assertRequiredFields = (kind, item, requiredFields) => {
  for (const field of requiredFields) {
    if (!(field in item)) {
      fail(`${kind} ${item.id || "(missing id)"} is missing ${field}`)
      continue
    }
    const value = item[field]
    if (Array.isArray(value) && value.length === 0) fail(`${kind} ${item.id} has empty ${field}`)
    if (typeof value === "string" && value.trim().length === 0) fail(`${kind} ${item.id} has blank ${field}`)
  }
}

const activities = parseListYaml(read("legal/data-map/processing-activities.yaml"), "activities")
const processors = parseListYaml(read("legal/vendors/processors.yaml"), "processors")
const legalBasisEntries = parseListYaml(read("legal/data-map/legal-basis-matrix.yaml"), "legalBasis")
const retentionRules = parseListYaml(read("legal/data-map/retention-matrix.yaml"), "retentionRules")
const processorIds = new Set(processors.map((processor) => processor.id))

if (activities.length < 10) fail(`expected at least 10 processing activities, got ${activities.length}`)
if (processors.length < 6) fail(`expected at least 6 processors, got ${processors.length}`)

const activityIds = new Set()
for (const activity of activities) {
  assertRequiredFields("activity", activity, requiredActivityFields)
  if (activityIds.has(activity.id)) fail(`duplicate activity id ${activity.id}`)
  activityIds.add(activity.id)
  for (const processorId of activity.processors || []) {
    if (!processorIds.has(processorId)) fail(`activity ${activity.id} references unknown processor ${processorId}`)
  }
}

for (const processor of processors) {
  assertRequiredFields("processor", processor, requiredProcessorFields)
  if (!/^[a-z0-9_]+$/.test(processor.id)) fail(`processor ${processor.id} must use snake_case id`)
}

for (const processorId of requiredProcessors) {
  if (!processorIds.has(processorId)) fail(`required processor ${processorId} is not registered`)
}

const legalBasisIds = new Set()
const activityLegalBasisMembership = new Map()
for (const legalBasisEntry of legalBasisEntries) {
  assertRequiredFields("legal basis", legalBasisEntry, ["id", "activities", "rationale"])
  if (legalBasisIds.has(legalBasisEntry.id)) fail(`duplicate legal basis id ${legalBasisEntry.id}`)
  legalBasisIds.add(legalBasisEntry.id)
  for (const activityId of legalBasisEntry.activities || []) {
    if (!activityIds.has(activityId)) fail(`legal basis ${legalBasisEntry.id} references unknown activity ${activityId}`)
    if (activityLegalBasisMembership.has(activityId)) fail(`activity ${activityId} appears in multiple legal basis entries`)
    activityLegalBasisMembership.set(activityId, legalBasisEntry.id)
  }
}

const retentionActivityIds = new Set()
for (const retentionRule of retentionRules) {
  assertRequiredFields("retention rule", retentionRule, ["activityId", "retention", "destruction", "followUp"])
  if (!activityIds.has(retentionRule.activityId)) fail(`retention rule references unknown activity ${retentionRule.activityId}`)
  if (retentionActivityIds.has(retentionRule.activityId)) fail(`duplicate retention rule for activity ${retentionRule.activityId}`)
  retentionActivityIds.add(retentionRule.activityId)
}

for (const activity of activities) {
  if (!legalBasisIds.has(activity.legalBasis)) fail(`activity ${activity.id} references unknown legal basis ${activity.legalBasis}`)
  const matrixLegalBasis = activityLegalBasisMembership.get(activity.id)
  if (!matrixLegalBasis) fail(`activity ${activity.id} is missing from legal-basis-matrix.yaml`)
  if (matrixLegalBasis && matrixLegalBasis !== activity.legalBasis) {
    fail(`activity ${activity.id} legalBasis ${activity.legalBasis} does not match matrix ${matrixLegalBasis}`)
  }
  if (!retentionActivityIds.has(activity.id)) fail(`activity ${activity.id} is missing from retention-matrix.yaml`)
}

for (const relativePath of [
  "legal/schemas/processing-activity.schema.json",
  "legal/schemas/processor.schema.json",
  "legal/data-map/data-flow.yaml",
  "legal/data-map/retention-matrix.yaml",
  "legal/data-map/legal-basis-matrix.yaml",
]) {
  if (!fs.existsSync(path.join(root, relativePath))) fail(`missing required artifact ${relativePath}`)
}

if (!process.exitCode) {
  console.log(`[privacy-data-map] ok: ${activities.length} activities, ${processors.length} processors`)
}
