export const ACTIVE_LEGAL_DOCUMENTS = {
  signupPolicyVersion: "1.0.0",
  terms: {
    version: "1.0.0",
    contentSha256: "5c0d0013897baf15be95d57adc15acfbd10d2772ab48572b07a75f8e2c9360a8",
  },
  privacy: {
    version: "1.0.0",
    contentSha256: "cedbfea674a9e2aca9e29bf6a01492a1e3fa640b0ff53d47f969d64c057b980f",
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
