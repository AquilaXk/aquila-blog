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
                signupPolicyVersion = "2026-06-21",
                terms =
                    LegalDocumentMetadata(
                        version = "2026-06-21",
                        contentSha256 = "3b71950e518b16b9a24cb4f9873633720ca7a9fce145a7bb9787c48845b56c5b",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "2026-06-21",
                        contentSha256 = "cedbfea674a9e2aca9e29bf6a01492a1e3fa640b0ff53d47f969d64c057b980f",
                    ),
            )
    }
}
