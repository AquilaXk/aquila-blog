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
                        contentSha256 = "12edf927d89a4fe9c629fefec4f01ebc0a98b3898d9f7cd96db424df5b94986b",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.0",
                        contentSha256 = "901852cce1aa6db1a0d46a2e35caf36060475c613fd4cd9c0870904411cd2cd7",
                    ),
            )
    }
}
