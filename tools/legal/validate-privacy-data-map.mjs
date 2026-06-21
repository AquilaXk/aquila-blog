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
  "home_server_redis",
  "vercel_frontend_hosting",
  "cloudflare_dns_proxy",
  "kakao_oauth",
  "smtp_provider_unconfirmed",
  "google_gemini",
  "home_server_backup_storage",
])
const requiredActivityDataCategories = new Map([
  ["account_registration_email", ["email", "nickname", "passwordHash"]],
  [
    "ai_tag_recommendation_gemini",
    ["tagRecommendationCacheKey", "tagRecommendationRateLimitKey", "tagRecommendationCachedResult"],
  ],
])
const requiredActivityEnvFragments = new Map([
  [
    "analytics_and_rum",
    ["NEXT_PUBLIC_RUM_SAMPLE_RATE", "defaults 0.2", "0 disables custom RUM"],
  ],
  [
    "ai_tag_recommendation_gemini",
    ["custom.ai.tag.enabled", "defaults true", "CUSTOM__AI__TAG__ENABLED=false", "custom.ai.tag.gemini."],
  ],
  ["file_uploads_profile_post_cloud", ["AQUILA_EXTERNAL_STORAGE_ROOT"]],
  ["backup_and_restore", ["AQUILA_BACKUP_ROOT"]],
])
const requiredActivityProcessors = new Map([
  ["signup_email_verification", ["home_server_redis"]],
  ["auth_session_and_cookies", ["home_server_redis"]],
  ["user_content_posts_comments", ["home_server_redis"]],
  ["auth_security_events", ["home_server_redis"]],
  ["notifications_sse", ["home_server_redis"]],
  ["ai_tag_recommendation_gemini", ["home_server_redis"]],
])
const requiredProcessorEnvFragments = new Map([
  [
    "google_gemini",
    ["custom.ai.tag.enabled", "defaults true", "CUSTOM__AI__TAG__ENABLED=false", "custom.ai.tag.gemini."],
  ],
  ["home_server_redis", ["custom.site.redisHost", "SPRING__DATA__REDIS__PASSWORD", "REDIS_IMAGE"]],
])
const requiredFlowProcessors = new Map([
  ["email_signup", ["home_server_postgresql", "home_server_redis", "smtp_provider_unconfirmed"]],
  ["kakao_oauth_login", ["home_server_postgresql", "kakao_oauth"]],
  ["auth_session", ["home_server_postgresql", "home_server_redis", "vercel_frontend_hosting", "cloudflare_dns_proxy"]],
  ["posts_comments_profile", ["home_server_postgresql", "home_server_redis", "vercel_frontend_hosting", "cloudflare_dns_proxy"]],
  ["uploads", ["home_server_postgresql", "home_server_minio", "home_server_backup_storage", "cloudflare_dns_proxy"]],
  ["security_and_action_logs", ["home_server_postgresql", "home_server_redis", "grafana_loki_monitoring"]],
  ["notifications_sse", ["home_server_postgresql", "home_server_redis", "vercel_frontend_hosting", "cloudflare_dns_proxy"]],
  ["analytics_rum", ["google_analytics", "vercel_frontend_hosting", "grafana_loki_monitoring"]],
  ["gemini_tag_recommendation", ["google_gemini", "vercel_frontend_hosting", "home_server_postgresql", "home_server_redis"]],
  ["backup_restore", ["home_server_backup_storage", "github_actions", "ghcr_container_registry"]],
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
const flows = parseListYaml(read("legal/data-map/data-flow.yaml"), "flows")
const legalBasisEntries = parseListYaml(read("legal/data-map/legal-basis-matrix.yaml"), "legalBasis")
const retentionRules = parseListYaml(read("legal/data-map/retention-matrix.yaml"), "retentionRules")
const processorIds = new Set(processors.map((processor) => processor.id))

if (activities.length < 10) fail(`expected at least 10 processing activities, got ${activities.length}`)
if (processors.length < 6) fail(`expected at least 6 processors, got ${processors.length}`)
if (flows.length < 10) fail(`expected at least 10 data flows, got ${flows.length}`)

const activityIds = new Set()
for (const activity of activities) {
  assertRequiredFields("activity", activity, requiredActivityFields)
  if (activityIds.has(activity.id)) fail(`duplicate activity id ${activity.id}`)
  activityIds.add(activity.id)
  for (const processorId of activity.processors || []) {
    if (!processorIds.has(processorId)) fail(`activity ${activity.id} references unknown processor ${processorId}`)
  }
  for (const dataCategory of requiredActivityDataCategories.get(activity.id) || []) {
    if (!activity.dataCategories.includes(dataCategory)) fail(`activity ${activity.id} is missing required data category ${dataCategory}`)
  }
  for (const envFragment of requiredActivityEnvFragments.get(activity.id) || []) {
    if (!activity.enabledByEnv.includes(envFragment)) fail(`activity ${activity.id} enabledByEnv must include ${envFragment}`)
  }
  for (const processorId of requiredActivityProcessors.get(activity.id) || []) {
    if (!activity.processors.includes(processorId)) fail(`activity ${activity.id} processors must include ${processorId}`)
  }
}

const seenProcessorIds = new Set()
for (const processor of processors) {
  assertRequiredFields("processor", processor, requiredProcessorFields)
  if (seenProcessorIds.has(processor.id)) fail(`duplicate processor id ${processor.id}`)
  seenProcessorIds.add(processor.id)
  if (!/^[a-z0-9_]+$/.test(processor.id)) fail(`processor ${processor.id} must use snake_case id`)
  for (const envFragment of requiredProcessorEnvFragments.get(processor.id) || []) {
    if (!processor.enabledByEnv.includes(envFragment)) fail(`processor ${processor.id} enabledByEnv must include ${envFragment}`)
  }
}

for (const processorId of requiredProcessors) {
  if (!processorIds.has(processorId)) fail(`required processor ${processorId} is not registered`)
}

const flowIds = new Set()
for (const flow of flows) {
  assertRequiredFields("flow", flow, ["id", "collectionPoint", "stores", "processors", "status"])
  if (flowIds.has(flow.id)) fail(`duplicate flow id ${flow.id}`)
  flowIds.add(flow.id)
  for (const processorId of flow.processors || []) {
    if (!processorIds.has(processorId)) fail(`flow ${flow.id} references unknown processor ${processorId}`)
  }
  for (const processorId of requiredFlowProcessors.get(flow.id) || []) {
    if (!flow.processors.includes(processorId)) fail(`flow ${flow.id} processors must include ${processorId}`)
  }
}

for (const flowId of requiredFlowProcessors.keys()) {
  if (!flowIds.has(flowId)) fail(`required flow ${flowId} is not registered`)
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
const retentionRuleByActivityId = new Map()
for (const retentionRule of retentionRules) {
  assertRequiredFields("retention rule", retentionRule, ["activityId", "retention", "destruction", "followUp"])
  if (!activityIds.has(retentionRule.activityId)) fail(`retention rule references unknown activity ${retentionRule.activityId}`)
  if (retentionActivityIds.has(retentionRule.activityId)) fail(`duplicate retention rule for activity ${retentionRule.activityId}`)
  retentionActivityIds.add(retentionRule.activityId)
  retentionRuleByActivityId.set(retentionRule.activityId, retentionRule)
}

for (const activity of activities) {
  if (!legalBasisIds.has(activity.legalBasis)) fail(`activity ${activity.id} references unknown legal basis ${activity.legalBasis}`)
  const matrixLegalBasis = activityLegalBasisMembership.get(activity.id)
  if (!matrixLegalBasis) fail(`activity ${activity.id} is missing from legal-basis-matrix.yaml`)
  if (matrixLegalBasis && matrixLegalBasis !== activity.legalBasis) {
    fail(`activity ${activity.id} legalBasis ${activity.legalBasis} does not match matrix ${matrixLegalBasis}`)
  }
  if (!retentionActivityIds.has(activity.id)) fail(`activity ${activity.id} is missing from retention-matrix.yaml`)
  const retentionRule = retentionRuleByActivityId.get(activity.id)
  if (retentionRule && retentionRule.retention !== activity.retentionRule) {
    fail(`activity ${activity.id} retention ${activity.retentionRule} does not match matrix ${retentionRule.retention}`)
  }
  if (retentionRule && retentionRule.destruction !== activity.destructionMethod) {
    fail(`activity ${activity.id} destruction ${activity.destructionMethod} does not match matrix ${retentionRule.destruction}`)
  }
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
