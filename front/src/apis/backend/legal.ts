import { apiFetch } from "./client"

export const ACTIVE_LEGAL_DOCUMENTS = {
  signupPolicyVersion: "1.0.1",
  terms: {
    version: "1.0.1",
    contentSha256: "379676461cc354709b0648030a758a6fe6b36c60272775465a56cdb5dba9b87e",
  },
  privacy: {
    version: "1.0.1",
    contentSha256: "c91dbe9a587040d66502d502cd259749e6d391ef8d52ddecf3a8a5b4732c122a",
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
