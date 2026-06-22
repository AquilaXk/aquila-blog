#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const policiesDir = path.join(root, "legal/policies")
const frontendLegalMetadataPath = path.join(root, "front/src/apis/backend/legal.ts")
const backendLegalMetadataPath = path.join(
  root,
  "back/src/main/kotlin/com/back/boundedContexts/member/subContexts/legalAcceptance/application/service/ActiveLegalDocumentMetadata.kt",
)
const requiredFields = [
  "documentType",
  "locale",
  "version",
  "publishedAt",
  "effectiveAt",
  "contentSha256",
  "supersedes",
  "owner",
  "contactEmail",
  "changeSummary",
  "sections",
]
const requiredPrivacySections = [
  "개인정보처리자 및 연락처",
  "처리 목적",
  "처리하는 개인정보 항목과 수집 방법",
  "처리의 법적 근거",
  "보유·이용기간",
  "개인정보의 파기 절차와 방법",
  "제3자 제공",
  "개인정보 처리위탁",
  "개인정보 국외이전",
  "쿠키·로컬 저장소·온라인 식별자",
  "Vercel Analytics·Speed Insights·자체 RUM",
  "Kakao 로그인",
  "Google Gemini 사용",
  "이용자와 법정대리인의 권리 및 행사방법",
  "만 14세 미만 이용자 정책",
  "개인정보의 안전성 확보조치",
  "자동화된 결정 여부",
  "개인정보 침해·민원 구제 절차",
  "개인정보 보호책임자 또는 담당자",
  "정책 변경, 시행일, 이전 버전",
]
const requiredTermsSections = [
  "목적",
  "용어 정의",
  "운영자 정보 및 적용 범위",
  "약관 게시·변경·통지",
  "이용계약 성립",
  "이용 자격과 만 14세 미만 정책",
  "계정 생성·관리·보안",
  "서비스 내용",
  "게시글·댓글·파일 등 이용자 콘텐츠",
  "이용자 콘텐츠의 저작권과 서비스 이용허락",
  "금지행위",
  "신고·노출 제한·삭제·계정 제재 절차",
  "서비스 변경·점검·중단",
  "외부 서비스와 링크",
  "AI 기능",
  "회원 탈퇴와 계약 종료",
  "개인정보 처리",
  "책임의 범위",
  "손해배상",
  "통지",
  "준거법·분쟁 해결",
  "시행일·이전 버전",
]
const requiredVendors = [
  "Vercel",
  "Cloudflare",
  "Kakao",
  "SMTP",
  "Google Analytics",
  "Google Gemini",
  "GitHub Actions",
  "GHCR",
  "PostgreSQL",
  "Redis",
  "MinIO",
  "Grafana",
  "Loki",
]
const legalPolicyStatuses = new Set(["draft", "effective", "superseded"])
const publicPolicyStatuses = new Set(["effective", "superseded"])
const forbiddenPublicPolicyTokens = [
  "reviewRequired",
  "법무·운영 확인 필요 항목",
  "출시 gate",
  "별도 이슈",
  "추후 확정",
  "구현 후 제공",
  "consent manager",
]

let failed = false

const fail = (message) => {
  failed = true
  console.error(`[legal-policies] ${message}`)
}

const getPolicyFiles = () => {
  if (!fs.existsSync(policiesDir)) {
    fail(`missing policies directory ${policiesDir}`)
    return []
  }
  const files = fs.readdirSync(policiesDir).filter((name) => name.endsWith(".yaml")).sort()
  if (files.length === 0) fail("no policy files found")
  return files
}

const stablePolicyHash = (policy) => {
  const normalized = { ...policy, contentSha256: "" }
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

const readPolicy = (fileName) => {
  const filePath = path.join(policiesDir, fileName)
  if (!fs.existsSync(filePath)) {
    fail(`missing policy file ${fileName}`)
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    fail(`${fileName} is not parseable JSON-compatible YAML: ${error.message}`)
    return null
  }
}

const readRawPolicy = (fileName) => {
  const filePath = path.join(policiesDir, fileName)
  if (!fs.existsSync(filePath)) {
    fail(`missing policy file ${fileName}`)
    return null
  }
  return fs.readFileSync(filePath, "utf8")
}

const extractQuotedValue = (source, pattern, label) => {
  const match = source.match(pattern)
  if (!match) {
    fail(`missing ${label}`)
    return ""
  }
  return match[1]
}

const readFrontendActiveMetadata = () => {
  if (!fs.existsSync(frontendLegalMetadataPath)) {
    fail(`missing frontend legal metadata ${frontendLegalMetadataPath}`)
    return null
  }

  const source = fs.readFileSync(frontendLegalMetadataPath, "utf8")
  return {
    signupPolicyVersion: extractQuotedValue(
      source,
      /signupPolicyVersion:\s*"([^"]+)"/,
      "frontend signupPolicyVersion",
    ),
    terms: {
      version: extractQuotedValue(source, /terms:\s*\{[\s\S]*?version:\s*"([^"]+)"/, "frontend terms version"),
      contentSha256: extractQuotedValue(
        source,
        /terms:\s*\{[\s\S]*?contentSha256:\s*"([^"]+)"/,
        "frontend terms contentSha256",
      ),
    },
    privacy: {
      version: extractQuotedValue(source, /privacy:\s*\{[\s\S]*?version:\s*"([^"]+)"/, "frontend privacy version"),
      contentSha256: extractQuotedValue(
        source,
        /privacy:\s*\{[\s\S]*?contentSha256:\s*"([^"]+)"/,
        "frontend privacy contentSha256",
      ),
    },
  }
}

const readBackendActiveMetadata = () => {
  if (!fs.existsSync(backendLegalMetadataPath)) {
    fail(`missing backend legal metadata ${backendLegalMetadataPath}`)
    return null
  }

  const source = fs.readFileSync(backendLegalMetadataPath, "utf8")
  return {
    signupPolicyVersion: extractQuotedValue(
      source,
      /signupPolicyVersion\s*=\s*"([^"]+)"/,
      "backend signupPolicyVersion",
    ),
    terms: {
      version: extractQuotedValue(source, /terms\s*=\s*[\s\S]*?version\s*=\s*"([^"]+)"/, "backend terms version"),
      contentSha256: extractQuotedValue(
        source,
        /terms\s*=\s*[\s\S]*?contentSha256\s*=\s*"([^"]+)"/,
        "backend terms contentSha256",
      ),
    },
    privacy: {
      version: extractQuotedValue(
        source,
        /privacy\s*=\s*[\s\S]*?version\s*=\s*"([^"]+)"/,
        "backend privacy version",
      ),
      contentSha256: extractQuotedValue(
        source,
        /privacy\s*=\s*[\s\S]*?contentSha256\s*=\s*"([^"]+)"/,
        "backend privacy contentSha256",
      ),
    },
  }
}

const assertRequiredShape = (fileName, policy) => {
  for (const field of requiredFields) {
    if (!(field in policy)) fail(`${fileName} is missing ${field}`)
  }
  if (policy.locale !== "ko-KR") fail(`${fileName} locale must be ko-KR`)
  if (!/^\d+\.\d+\.\d+$/.test(policy.version || "")) fail(`${fileName} version must be semver`)
  if ("status" in policy && !legalPolicyStatuses.has(policy.status)) {
    fail(`${fileName} status must be draft|effective|superseded`)
  }
  if (Number.isNaN(Date.parse(policy.publishedAt || ""))) fail(`${fileName} publishedAt must be date-time`)
  if (Number.isNaN(Date.parse(policy.effectiveAt || ""))) fail(`${fileName} effectiveAt must be date-time`)
  if (!/^[a-f0-9]{64}$/.test(policy.contentSha256 || "")) fail(`${fileName} contentSha256 must be 64 lowercase hex`)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(policy.contactEmail || "")) fail(`${fileName} contactEmail must be email`)
  if (policy.contactEmail !== "aquilaxk10@gmail.com") fail(`${fileName} contactEmail must be aquilaxk10@gmail.com`)
  if (!Array.isArray(policy.changeSummary) || policy.changeSummary.length === 0) fail(`${fileName} changeSummary is empty`)
  if ("reviewRequired" in policy && (!Array.isArray(policy.reviewRequired) || policy.reviewRequired.length === 0)) {
    fail(`${fileName} reviewRequired must be a non-empty string array when present`)
  }
  if (publicPolicyStatuses.has(policy.status) && "reviewRequired" in policy) {
    fail(`${fileName} public policy must not contain reviewRequired`)
  }
  for (const item of policy.reviewRequired || []) {
    if (typeof item !== "string" || item.trim().length === 0) fail(`${fileName} has empty reviewRequired item`)
  }
  if (!Array.isArray(policy.sections) || policy.sections.length === 0) fail(`${fileName} sections is empty`)
  for (const section of policy.sections || []) {
    if (!section.id || !section.title) fail(`${fileName} has a section without id/title`)
    if (!Array.isArray(section.body) || section.body.length === 0) fail(`${fileName} section ${section.id} has empty body`)
  }
  const actualHash = stablePolicyHash(policy)
  if (policy.contentSha256 !== actualHash) fail(`${fileName} contentSha256 mismatch: expected ${actualHash}`)
}

const assertSectionTitles = (fileName, policy, requiredTitles) => {
  const titles = new Set((policy.sections || []).map((section) => section.title))
  for (const title of requiredTitles) {
    if (!titles.has(title)) fail(`${fileName} is missing required section title: ${title}`)
  }
}

const assertTextIncludes = (fileName, policy, tokens) => {
  const text = JSON.stringify(policy)
  for (const token of tokens) {
    if (!text.includes(token)) fail(`${fileName} must mention ${token}`)
  }
}

const assertPublicTextIsPublicReady = (fileName, policy) => {
  if (!publicPolicyStatuses.has(policy.status)) return

  const text = JSON.stringify(policy)
  for (const token of forbiddenPublicPolicyTokens) {
    if (text.includes(token)) fail(`${fileName} public policy exposes internal review token: ${token}`)
  }
}

const compareSemver = (left, right) => {
  const leftParts = left.split(".").map((value) => Number.parseInt(value, 10))
  const rightParts = right.split(".").map((value) => Number.parseInt(value, 10))
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

const setLatestEffectivePolicy = (map, policy) => {
  if (policy.status !== "effective") return

  const existing = map.get(policy.documentType)
  if (!existing || compareSemver(existing.version, policy.version) < 0) {
    map.set(policy.documentType, policy)
  }
}

const assertActiveMetadataMatchesPolicies = (sourceName, metadata, termsPolicy, privacyPolicy) => {
  if (!metadata || !termsPolicy || !privacyPolicy) return

  if (metadata.signupPolicyVersion !== termsPolicy.version) {
    fail(`${sourceName} signupPolicyVersion mismatch: expected ${termsPolicy.version}`)
  }
  if (metadata.terms.version !== termsPolicy.version) {
    fail(`${sourceName} terms version mismatch: expected ${termsPolicy.version}`)
  }
  if (metadata.terms.contentSha256 !== termsPolicy.contentSha256) {
    fail(`${sourceName} terms contentSha256 mismatch: expected ${termsPolicy.contentSha256}`)
  }
  if (metadata.privacy.version !== privacyPolicy.version) {
    fail(`${sourceName} privacy version mismatch: expected ${privacyPolicy.version}`)
  }
  if (metadata.privacy.contentSha256 !== privacyPolicy.contentSha256) {
    fail(`${sourceName} privacy contentSha256 mismatch: expected ${privacyPolicy.contentSha256}`)
  }
}

const policies = new Map()
const latestEffectivePolicies = new Map()
const policyFiles = getPolicyFiles()
for (const fileName of policyFiles) {
  const policy = readPolicy(fileName)
  if (!policy) continue
  assertRequiredShape(fileName, policy)
  assertPublicTextIsPublicReady(fileName, policy)
  policies.set(policy.documentType, policy)
  setLatestEffectivePolicy(latestEffectivePolicies, policy)
}

if (!latestEffectivePolicies.has("PRIVACY_POLICY")) fail("missing effective PRIVACY_POLICY")
if (!latestEffectivePolicies.has("TERMS_OF_SERVICE")) fail("missing effective TERMS_OF_SERVICE")
if (!latestEffectivePolicies.has("COOKIE_POLICY")) fail("missing effective COOKIE_POLICY")

const privacy = latestEffectivePolicies.get("PRIVACY_POLICY")
if (privacy) {
  assertSectionTitles(`privacy.ko-KR.v${privacy.version}.yaml`, privacy, requiredPrivacySections)
  assertTextIncludes(`privacy.ko-KR.v${privacy.version}.yaml`, privacy, requiredVendors)
  assertTextIncludes(`privacy.ko-KR.v${privacy.version}.yaml`, privacy, ["apiKey", "refresh token", "NEXT_PUBLIC_RUM_SAMPLE_RATE"])
}

const terms = latestEffectivePolicies.get("TERMS_OF_SERVICE")
if (terms) {
  assertSectionTitles(`terms.ko-KR.v${terms.version}.yaml`, terms, requiredTermsSections)
  assertTextIncludes(`terms.ko-KR.v${terms.version}.yaml`, terms, ["고의 또는 중대한 과실", "부당하게 불리한 전속 관할"])
}

assertActiveMetadataMatchesPolicies("frontend active legal metadata", readFrontendActiveMetadata(), terms, privacy)
assertActiveMetadataMatchesPolicies("backend active legal metadata", readBackendActiveMetadata(), terms, privacy)

const cookies = latestEffectivePolicies.get("COOKIE_POLICY")
if (cookies) {
  assertTextIncludes(`cookies.ko-KR.v${cookies.version}.yaml`, cookies, ["필수 쿠키", "Analytics", "RUM", "NEXT_PUBLIC_RUM_SAMPLE_RATE"])
}

for (const fileName of policyFiles) {
  const raw = readRawPolicy(fileName)
  if (!raw) continue
  if (raw.includes("illusiveman7@gmail.com")) fail(`${fileName} contains stale contact email`)
}

if (failed) process.exit(1)
console.log(`[legal-policies] ok: ${policyFiles.length} policies`)
