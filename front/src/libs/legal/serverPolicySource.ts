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
    .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.version.localeCompare(a.version))
  return { props: { policies } }
}
