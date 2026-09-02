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
                signupPolicyVersion = "1.0.4",
                terms =
                    LegalDocumentMetadata(
                        version = "1.0.4",
                        contentSha256 = "f18c911c0c2c10dbd2f2131226afbb1391c92b310bd3d1dc9ffd5f0ba578c6dd",
                    ),
                privacy =
                    LegalDocumentMetadata(
                        version = "1.0.4",
                        contentSha256 = "42756f25ffd14545fa4c85c6569cb6a195b268de6a29a4acd90f975f231b0eab",
                    ),
            )
    }
}
