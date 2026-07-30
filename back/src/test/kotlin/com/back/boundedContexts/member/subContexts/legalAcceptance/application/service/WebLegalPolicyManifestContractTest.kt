package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.nio.file.Path
import kotlin.io.path.readText

class WebLegalPolicyManifestContractTest {
    @Test
    @DisplayName("pinned Web policy lock matches backend acceptance metadata while cookies are excluded")
    fun pinnedWebPolicyLockMatchesBackendMetadataAndExcludesCookies() {
        val lock = Path.of("../contracts/web/legal-policy-manifest.lock.json").readText()
        val active = ActiveLegalDocumentMetadata.current()
        val terms = metadata(lock, "terms")
        val privacy = metadata(lock, "privacy")
        val cookies = metadata(lock, "cookies")

        assertThat(active.terms).isEqualTo(terms)
        assertThat(active.privacy).isEqualTo(privacy)
        assertThat(active.signupPolicyVersion).isEqualTo(maxSemver(terms.version, privacy.version))
        assertThat(cookies.version).matches("\\d+\\.\\d+\\.\\d+")
        assertThat(cookies.contentSha256).matches("[a-f0-9]{64}")
        assertThat(ActiveLegalDocumentMetadata::class.java.declaredFields.map { it.name }).doesNotContain("cookies")
    }

    private fun metadata(
        lock: String,
        name: String,
    ): LegalDocumentMetadata {
        val body =
            requireNotNull(Regex("\"$name\"\\s*:\\s*\\{([^}]*)}", RegexOption.DOT_MATCHES_ALL).find(lock)) {
                "missing $name lock metadata"
            }.groupValues[1]
        return LegalDocumentMetadata(
            version = requireNotNull(Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(body)) { "missing $name version" }.groupValues[1],
            contentSha256 =
                requireNotNull(
                    Regex("\"contentSha256\"\\s*:\\s*\"([^\"]+)\"").find(body),
                ) { "missing $name contentSha256" }.groupValues[1],
        )
    }

    private fun maxSemver(
        left: String,
        right: String,
    ): String = if (compareSemver(left, right) >= 0) left else right

    private fun compareSemver(
        left: String,
        right: String,
    ): Int {
        val leftParts = left.split(".").map(String::toInt)
        val rightParts = right.split(".").map(String::toInt)
        for (index in 0 until 3) {
            val difference = leftParts[index] - rightParts[index]
            if (difference != 0) return difference
        }
        return 0
    }
}
