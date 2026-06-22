package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.nio.file.Path
import kotlin.io.path.readText

class ActiveLegalDocumentMetadataTest {
    @Test
    @DisplayName("current legal metadata matches the public policy source files")
    fun currentMetadataMatchesPublicPolicySources() {
        val active = ActiveLegalDocumentMetadata.current()

        val terms = readPolicyMetadata("../legal/policies/terms.ko-KR.v1.0.1.yaml")
        val privacy = readPolicyMetadata("../legal/policies/privacy.ko-KR.v1.0.1.yaml")

        assertThat(active.signupPolicyVersion).isEqualTo(terms.version)
        assertThat(active.terms).isEqualTo(terms)
        assertThat(active.privacy).isEqualTo(privacy)
    }

    private fun readPolicyMetadata(path: String): LegalDocumentMetadata {
        val raw = Path.of(path).readText()
        val version = requireNotNull(extractJsonString(raw, "version")) { "missing version in $path" }
        val contentSha256 = requireNotNull(extractJsonString(raw, "contentSha256")) { "missing contentSha256 in $path" }
        return LegalDocumentMetadata(version = version, contentSha256 = contentSha256)
    }

    private fun extractJsonString(
        raw: String,
        key: String,
    ): String? {
        val pattern = Regex(""""$key"\s*:\s*"([^"]+)"""")
        return pattern.find(raw)?.groupValues?.get(1)
    }
}
