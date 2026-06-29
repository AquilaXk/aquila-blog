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
                signupPolicyVersion = "1.0.3",
                terms =
                    LegalDocumentMetadata(
                        version = "1.0.2",
                        contentSha256 = "825642074982313f39c5d9bfbeffb20b12fc1a072addce8770b332652a75ad9b",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.3",
                        contentSha256 = "b1a9d7f800214aeab69e0185c2a4721dc394afd3c47a581a3190888a17d95827",
                    ),
            )
    }
}
