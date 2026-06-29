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
                        contentSha256 = "c7b9da465ac101aa19162c3cc0d400252af1769008c6d17e2b2436abc40e4f48",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.3",
                        contentSha256 = "58bb166ab2705ff81e4171d405ad3d213b4f26c744a3f0ef937ac053834d7f60",
                    ),
            )
    }
}
