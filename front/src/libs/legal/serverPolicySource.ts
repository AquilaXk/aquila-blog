import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import {
  ACTIVE_LEGAL_POLICY_VERSION,
  ACTIVE_LEGAL_POLICY_VERSIONS,
  legalPolicyCurrentPaths,
  legalPolicyHistoryPath,
  legalPolicyKindLabels,
  toLegalPolicyVersionPath,
} from "./policyLinks"
import type { LegalPolicyDocument, LegalPolicyKind, LegalPolicyPageProps, LegalPolicySummary } from "./policyTypes"

const policyDir = path.resolve(process.cwd(), "..", "legal", "policies")

const publicPolicyVersionsByKind: Record<LegalPolicyKind, string[]> = {
  privacy: [ACTIVE_LEGAL_POLICY_VERSIONS.privacy],
  terms: [ACTIVE_LEGAL_POLICY_VERSIONS.terms],
  cookies: ["1.0.0", ACTIVE_LEGAL_POLICY_VERSION, ACTIVE_LEGAL_POLICY_VERSIONS.cookies],
}

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

const canonicalPolicyJson = (policy: LegalPolicyDocument) => JSON.stringify({ ...policy, contentSha256: "" })

const stablePolicyHash = (policy: LegalPolicyDocument) =>
  crypto.createHash("sha256").update(canonicalPolicyJson(policy)).digest("hex")

const readPolicy = (
  kind: LegalPolicyKind,
  version = ACTIVE_LEGAL_POLICY_VERSIONS[kind],
): LegalPolicyDocument => {
  if (version !== ACTIVE_LEGAL_POLICY_VERSIONS[kind]) {
    if (!publicPolicyVersionsByKind[kind].includes(version)) {
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

const getPolicyDownloadFilename = (kind: LegalPolicyKind, version: string) => `aquilalog-${kind}-${version}.canonical.json`

export const getLegalPolicyPageStaticProps = (kind: LegalPolicyKind, version?: string) => {
  const policy = readPolicy(kind, version)
  const isCurrentRoute = version == null
  const props: LegalPolicyPageProps = {
    policy,
    kind,
    currentHref: legalPolicyCurrentPaths[kind],
    versionHref: toLegalPolicyVersionPath(kind, policy.version),
    historyHref: legalPolicyHistoryPath,
    downloadText: canonicalPolicyJson(policy),
    downloadFilename: getPolicyDownloadFilename(kind, policy.version),
    downloadHashBasis: "contentSha256 필드를 빈 문자열로 둔 canonical JSON 바이트",
    isCurrentRoute,
  }
  return { props }
}

export const getLegalPolicyVersionStaticPaths = (kind: LegalPolicyKind) => ({
  paths: publicPolicyVersionsByKind[kind].map((version) => ({ params: { version } })),
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
      publicPolicyVersionsByKind[kind].map((version) => {
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
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || compareSemver(b.version, a.version))
  return { props: { policies } }
}
