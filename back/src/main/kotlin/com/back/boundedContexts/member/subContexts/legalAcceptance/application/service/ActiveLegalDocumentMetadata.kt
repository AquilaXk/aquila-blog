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
                        contentSha256 = "ecee547a8890a33bb6b63352b4d5add3257757704f78946687b29204e6fb4780",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.2",
                        contentSha256 = "ee299ca6ea2b719516ee97ca1aa291fb7cade9fa2391d2fad27b7351f211994d",
                    ),
            )
    }
}
