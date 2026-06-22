import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {
  ACTIVE_LEGAL_POLICY_VERSION,
  legalPolicyCurrentPaths,
  legalPolicyHistoryPath,
  legalPolicyKindLabels,
  toLegalPolicyVersionPath,
} from "./policyLinks"
import type { LegalPolicyDocument, LegalPolicyKind, LegalPolicyPageProps, LegalPolicySummary } from "./policyTypes"

const policyDir = path.resolve(process.cwd(), "..", "legal", "policies")

const publicPolicyVersions = [ACTIVE_LEGAL_POLICY_VERSION] as const

const policyFilePrefixes: Record<LegalPolicyKind, string> = {
  privacy: "privacy",
  terms: "terms",
  cookies: "cookies",
}

const policyDocumentTypes: Record<LegalPolicyKind, LegalPolicyDocument["documentType"]> = {
  privacy: "PRIVACY_POLICY",
  terms: "TERMS_OF_SERVICE",
  cookies: "COOKIE_POLICY",
}

const getPolicyFileName = (kind: LegalPolicyKind, version: string) =>
  `${policyFilePrefixes[kind]}.ko-KR.v${version}.yaml`

const stablePolicyHash = (policy: LegalPolicyDocument) => {
  const normalized = { ...policy, contentSha256: "" }
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

const readPolicy = (kind: LegalPolicyKind, version = ACTIVE_LEGAL_POLICY_VERSION): LegalPolicyDocument => {
  if (version !== ACTIVE_LEGAL_POLICY_VERSION) {
    if (!(publicPolicyVersions as readonly string[]).includes(version)) {
      throw new Error(`Unsupported legal policy version: ${kind}@${version}`)
    }
  }
  const source = fs.readFileSync(path.join(policyDir, getPolicyFileName(kind, version)), "utf8")
  const policy = JSON.parse(source) as LegalPolicyDocument
  if (policy.documentType !== policyDocumentTypes[kind]) {
    throw new Error(`Legal policy documentType mismatch: ${kind}@${version}`)
  }
  if (policy.version !== version) {
    throw new Error(`Legal policy version mismatch: ${kind}@${version}`)
  }
  const actualHash = stablePolicyHash(policy)
  if (policy.contentSha256 !== actualHash) {
    throw new Error(`Legal policy hash mismatch: ${kind}@${policy.version}`)
  }
  return policy
}

const buildDownloadText = (policy: LegalPolicyDocument) => {
  const lines = [
    `${policy.owner} ${policy.documentType} ${policy.version}`,
    `시행일: ${policy.effectiveAt}`,
    `contentSha256: ${policy.contentSha256}`,
    "",
    ...policy.sections.flatMap((section) => [`# ${section.title}`, ...section.body, ""]),
  ]
  return lines.join("\n")
}

export const getLegalPolicyPageStaticProps = (kind: LegalPolicyKind, version = ACTIVE_LEGAL_POLICY_VERSION) => {
  const policy = readPolicy(kind, version)
  const props: LegalPolicyPageProps = {
    policy,
    kind,
    currentHref: legalPolicyCurrentPaths[kind],
    versionHref: toLegalPolicyVersionPath(kind, policy.version),
    historyHref: legalPolicyHistoryPath,
    downloadText: buildDownloadText(policy),
  }
  return { props }
}

export const getLegalPolicyVersionStaticPaths = (kind: LegalPolicyKind) => ({
  paths: publicPolicyVersions.map((version) => ({ params: { version } })),
  fallback: false,
})

const compareSemver = (left: string, right: string) => {
  const leftParts = left.split(".").map((value) => Number.parseInt(value, 10))
  const rightParts = right.split(".").map((value) => Number.parseInt(value, 10))
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export const getLegalPolicyHistoryStaticProps = () => {
  const policies: LegalPolicySummary[] = (Object.keys(policyFilePrefixes) as LegalPolicyKind[])
    .flatMap((kind) =>
      publicPolicyVersions.map((version) => {
        const policy = readPolicy(kind, version)
        return {
          kind,
          title: legalPolicyKindLabels[kind],
          version: policy.version,
          effectiveAt: policy.effectiveAt,
          contentSha256: policy.contentSha256,
          href: toLegalPolicyVersionPath(kind, policy.version),
          currentHref: legalPolicyCurrentPaths[kind],
          changeSummary: policy.changeSummary,
        }
      }),
    )
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || compareSemver(a.version, b.version))
  return { props: { policies } }
}
