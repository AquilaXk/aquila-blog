package com.back.boundedContexts.member.subContexts.legalAcceptance.application.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import java.nio.file.Path
import kotlin.io.path.readText

class WebLegalPolicyManifestContractTest {
    @Test
    @DisplayName("pinned Web policy lock matches backend acceptance metadata while cookies are excluded")
    fun pinnedWebPolicyLockMatchesBackendMetadataAndExcludesCookies() {
        val lock = ObjectMapper().readTree(Path.of("../contracts/web/legal-policy-manifest.lock.json").readText())
        val active = ActiveLegalDocumentMetadata.current()
        val terms = metadata(lock.path("active"), "terms")
        val privacy = metadata(lock.path("active"), "privacy")
        val cookies = metadata(lock.path("active"), "cookies")

        assertThat(active.terms).isEqualTo(terms)
        assertThat(active.privacy).isEqualTo(privacy)
        assertThat(active.signupPolicyVersion).isEqualTo(maxSemver(terms.version, privacy.version))
        assertThat(cookies.version).matches("\\d+\\.\\d+\\.\\d+")
        assertThat(cookies.contentSha256).matches("[a-f0-9]{64}")
        assertThat(ActiveLegalDocumentMetadata::class.java.declaredFields.map { it.name }).doesNotContain("cookies")
    }

    private fun metadata(
        active: JsonNode,
        name: String,
    ): LegalDocumentMetadata {
        require(
            active.isObject &&
                active.size() == 3 &&
                active.get("terms") != null &&
                active.get("privacy") != null &&
                active.get("cookies") != null,
        ) {
            "active must contain only terms, privacy, and cookies"
        }
        val body = active.path(name)
        require(body.isObject && body.size() == 2 && body.get("version") != null && body.get("contentSha256") != null) {
            "$name must contain only version and contentSha256"
        }
        val version = body.path("version").asText()
        val contentSha256 = body.path("contentSha256").asText()
        require(Regex("\\d+\\.\\d+\\.\\d+").matches(version)) { "invalid $name version" }
        require(Regex("[a-f0-9]{64}").matches(contentSha256)) { "invalid $name contentSha256" }
        return LegalDocumentMetadata(
            version = version,
            contentSha256 = contentSha256,
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
        require(
            Regex("\\d+\\.\\d+\\.\\d+").matches(left) && Regex("\\d+\\.\\d+\\.\\d+").matches(right),
        ) { "versions must be strict semver" }
        val leftParts = left.split(".")
        val rightParts = right.split(".")
        for (index in 0 until 3) {
            val leftPart = leftParts[index].trimStart('0').ifEmpty { "0" }
            val rightPart = rightParts[index].trimStart('0').ifEmpty { "0" }
            val lengthDifference = leftPart.length.compareTo(rightPart.length)
            if (lengthDifference != 0) return lengthDifference
            val lexicalDifference = leftPart.compareTo(rightPart)
            if (lexicalDifference != 0) return lexicalDifference
        }
        return 0
    }
}
