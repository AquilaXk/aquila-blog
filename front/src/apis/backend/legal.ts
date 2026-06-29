import { apiFetch } from "./client"

export const ACTIVE_LEGAL_DOCUMENTS = {
  signupPolicyVersion: "1.0.3",
  terms: {
    version: "1.0.2",
    contentSha256: "c7b9da465ac101aa19162c3cc0d400252af1769008c6d17e2b2436abc40e4f48",
  },
  privacy: {
    version: "1.0.3",
    contentSha256: "58bb166ab2705ff81e4171d405ad3d213b4f26c744a3f0ef937ac053834d7f60",
  },
} as const

export const SIGNUP_LEGAL_POLICY_VERSION = ACTIVE_LEGAL_DOCUMENTS.signupPolicyVersion

export const buildEmailSignupLegalAcceptancePayload = (input: {
  age14OrOlder: boolean
  requiredPrivacyConfirmed: boolean
  analyticsConsent: boolean
  overseasTransferAcknowledged: boolean
}) => ({
  termsVersion: ACTIVE_LEGAL_DOCUMENTS.terms.version,
  termsContentSha256: ACTIVE_LEGAL_DOCUMENTS.terms.contentSha256,
  privacyVersion: ACTIVE_LEGAL_DOCUMENTS.privacy.version,
  privacyContentSha256: ACTIVE_LEGAL_DOCUMENTS.privacy.contentSha256,
  age14OrOlder: input.age14OrOlder,
  requiredPrivacyConfirmed: input.requiredPrivacyConfirmed,
  analyticsConsent: input.analyticsConsent,
  overseasTransferAcknowledged: input.overseasTransferAcknowledged,
})

export const buildSocialSignupLegalAcceptancePayload = buildEmailSignupLegalAcceptancePayload

export type LegalReconsentStatus = {
  status: "CURRENT" | "RECONSENT_REQUIRED"
  required: boolean
  termsVersion: string
  termsContentSha256: string
  privacyVersion: string
  privacyContentSha256: string
  acceptedAt?: string | null
  refusalGuidePath: string
  exportGuidePath: string
  deletionGuidePath: string
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type AuthSessionLegalResponse = {
  legalReconsent?: LegalReconsentStatus | null
}

export const getLegalReconsentStatus = async () => {
  const session = await apiFetch<AuthSessionLegalResponse>("/member/api/v1/auth/session")
  return session.legalReconsent ?? null
}

export const submitLegalReconsent = async (input: {
  age14OrOlder: boolean
  requiredPrivacyConfirmed: boolean
  analyticsConsent: boolean
  overseasTransferAcknowledged: boolean
}) => {
  return await apiFetch<RsData<{ legalReconsent: LegalReconsentStatus }>>("/member/api/v1/auth/legal-reconsent", {
    method: "POST",
    body: JSON.stringify(buildEmailSignupLegalAcceptancePayload(input)),
  })
}
