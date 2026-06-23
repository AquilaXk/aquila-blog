import type { LegalPolicyKind } from "./policyTypes"

export const ACTIVE_LEGAL_POLICY_VERSION = "1.0.1"
export const ACTIVE_LEGAL_POLICY_VERSIONS: Record<LegalPolicyKind, string> = {
  privacy: "1.0.2",
  terms: ACTIVE_LEGAL_POLICY_VERSION,
  cookies: "1.0.2",
}

export const legalPolicyKindLabels: Record<LegalPolicyKind, string> = {
  privacy: "개인정보처리방침",
  terms: "이용약관",
  cookies: "쿠키 정책",
}

export const legalPolicyCurrentPaths: Record<LegalPolicyKind, string> = {
  privacy: "/privacy",
  terms: "/terms",
  cookies: "/cookies",
}

export const toLegalPolicyVersionPath = (kind: LegalPolicyKind, version: string) => `/legal/${kind}/${version}`

export const legalPolicyHistoryPath = "/legal/history"
