package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

data class LegalDocumentMetadata(
    val version: String,
    val contentSha256: String,
)

data class ActiveLegalDocumentMetadata(
    val signupPolicyVersion: String,
    val terms: LegalDocumentMetadata,
    val privacy: LegalDocumentMetadata,
) {
    companion object {
        fun current(): ActiveLegalDocumentMetadata =
            ActiveLegalDocumentMetadata(
                signupPolicyVersion = "1.0.0",
                terms =
                    LegalDocumentMetadata(
                        version = "1.0.0",
                        contentSha256 = "5c0d0013897baf15be95d57adc15acfbd10d2772ab48572b07a75f8e2c9360a8",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.0",
                        contentSha256 = "cedbfea674a9e2aca9e29bf6a01492a1e3fa640b0ff53d47f969d64c057b980f",
                    ),
            )
    }
}
