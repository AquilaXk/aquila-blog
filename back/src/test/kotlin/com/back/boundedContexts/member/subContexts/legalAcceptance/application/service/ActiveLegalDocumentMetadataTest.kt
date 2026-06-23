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
        val privacy = readPolicyMetadata("../legal/policies/privacy.ko-KR.v1.0.2.yaml")
        val expectedSignupPolicyVersion = latestVersion(terms.version, privacy.version)

        assertThat(active.signupPolicyVersion).isEqualTo(expectedSignupPolicyVersion)
        assertThat(active.terms).isEqualTo(terms)
        assertThat(active.privacy).isEqualTo(privacy)
    }

    private fun readPolicyMetadata(path: String): LegalDocumentMetadata {
        val raw = Path.of(path).readText()
        val version = requireNotNull(extractJsonString(raw, "version")) { "missing version in $path" }
        val contentSha256 = requireNotNull(extractJsonString(raw, "contentSha256")) { "missing contentSha256 in $path" }
        return LegalDocumentMetadata(version = version, contentSha256 = contentSha256)
    }

    private fun latestVersion(
        left: String,
        right: String,
    ): String = if (compareSemver(left, right) >= 0) left else right

    private fun compareSemver(
        left: String,
        right: String,
    ): Int {
        val leftParts = left.split(".").map { it.toIntOrNull() ?: 0 }
        val rightParts = right.split(".").map { it.toIntOrNull() ?: 0 }

        for (index in 0 until maxOf(leftParts.size, rightParts.size)) {
            val diff = (leftParts.getOrNull(index) ?: 0) - (rightParts.getOrNull(index) ?: 0)
            if (diff != 0) return diff
        }

        return 0
    }

    private fun extractJsonString(
        raw: String,
        key: String,
    ): String? {
        val pattern = Regex(""""$key"\s*:\s*"([^"]+)"""")
        return pattern.find(raw)?.groupValues?.get(1)
    }
}
