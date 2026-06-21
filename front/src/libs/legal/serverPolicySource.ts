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

const policyFileNames: Record<LegalPolicyKind, string> = {
  privacy: "privacy.ko-KR.v1.0.0.yaml",
  terms: "terms.ko-KR.v1.0.0.yaml",
  cookies: "cookies.ko-KR.v1.0.0.yaml",
}

const stablePolicyHash = (policy: LegalPolicyDocument) => {
  const normalized = { ...policy, contentSha256: "" }
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

const readPolicy = (kind: LegalPolicyKind, version = ACTIVE_LEGAL_POLICY_VERSION): LegalPolicyDocument => {
  if (version !== ACTIVE_LEGAL_POLICY_VERSION) {
    throw new Error(`Unsupported legal policy version: ${kind}@${version}`)
  }
  const source = fs.readFileSync(path.join(policyDir, policyFileNames[kind]), "utf8")
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
  paths: [{ params: { version: ACTIVE_LEGAL_POLICY_VERSION } }],
  fallback: false,
})

export const getLegalPolicyHistoryStaticProps = () => {
  const policies: LegalPolicySummary[] = (Object.keys(policyFileNames) as LegalPolicyKind[]).map((kind) => {
    const policy = readPolicy(kind)
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
  })
  return { props: { policies } }
}
