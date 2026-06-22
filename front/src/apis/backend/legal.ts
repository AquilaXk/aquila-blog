export const ACTIVE_LEGAL_DOCUMENTS = {
  signupPolicyVersion: "1.0.0",
  terms: {
    version: "1.0.0",
    contentSha256: "12edf927d89a4fe9c629fefec4f01ebc0a98b3898d9f7cd96db424df5b94986b",
  },
  privacy: {
    version: "1.0.0",
    contentSha256: "901852cce1aa6db1a0d46a2e35caf36060475c613fd4cd9c0870904411cd2cd7",
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
