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
                signupPolicyVersion = "1.0.2",
                terms =
                    LegalDocumentMetadata(
                        version = "1.0.1",
                        contentSha256 = "379676461cc354709b0648030a758a6fe6b36c60272775465a56cdb5dba9b87e",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.2",
                        contentSha256 = "d5d40597a589187395132deb831c0f01a409a5e05380119f2e2f8930ca88122b",
                    ),
            )
    }
}
