import type { LegalPolicyKind } from "./policyTypes"

export const ACTIVE_LEGAL_POLICY_VERSION = "1.0.0"

export const legalPolicyKindLabels: Record<LegalPolicyKind, string> = {
  privacy: "개인정보처리방침",
  terms: "이용약관",
  cookies: "쿠키 정책",
}

export const legalPolicyCurrentPaths: Record<LegalPolicyKind, string> = {
  privacy: "/privacy",
  terms: "/terms",
  cookies: `/legal/cookies/${ACTIVE_LEGAL_POLICY_VERSION}`,
}

export const toLegalPolicyVersionPath = (kind: LegalPolicyKind, version: string) => `/legal/${kind}/${version}`

export const legalPolicyHistoryPath = "/legal/history"
