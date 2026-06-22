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
                signupPolicyVersion = "1.0.1",
                terms =
                    LegalDocumentMetadata(
                        version = "1.0.1",
                        contentSha256 = "379676461cc354709b0648030a758a6fe6b36c60272775465a56cdb5dba9b87e",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.1",
                        contentSha256 = "c91dbe9a587040d66502d502cd259749e6d391ef8d52ddecf3a8a5b4732c122a",
                    ),
            )
    }
}
