package com.back.global.security.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

@DisplayName("Public API Caddy drift 테스트")
class PublicApiCaddyDriftTest {
    @Test
    @DisplayName("SoT export와 snapshot, Caddyfile @publicReadFallback path set이 일치한다")
    fun `sot export matches snapshot and caddyfile`() {
        val matcher = TestPublicApiRequestMatchers.defaultMatcher()
        val exported = matcher.edgePublicReadCaddyPaths()
        val snapshot = readSnapshotPaths()
        val caddyPaths = readCaddyPublicReadPaths()

        assertThat(exported)
            .describedAs("Kotlin SoT export vs tools/guards/public-api-read-caddy-paths.sot")
            .isEqualTo(snapshot)
        assertThat(caddyPaths)
            .describedAs("Caddyfile @publicReadFallback vs SoT snapshot")
            .isEqualTo(snapshot)
    }

    private fun readSnapshotPaths(): Set<String> {
        val path = repoRoot().resolve("tools/guards/public-api-read-caddy-paths.sot")
        return Files
            .readAllLines(path)
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.startsWith("#") }
            .toSortedSet()
    }

    private fun readCaddyPublicReadPaths(): Set<String> {
        val caddyfile = Files.readString(repoRoot().resolve("deploy/homeserver/caddy/Caddyfile"))
        val block =
            Regex(
                """@publicReadFallback\s*\{(.*?)^\}""",
                setOf(RegexOption.DOT_MATCHES_ALL, RegexOption.MULTILINE),
            ).find(caddyfile)
                ?.groupValues
                ?.get(1)
                ?: error("@publicReadFallback block not found in Caddyfile")
        val pathLine =
            block
                .lineSequence()
                .map { it.trim() }
                .firstOrNull { it.startsWith("path ") }
                ?: error("path directive not found in @publicReadFallback")
        return pathLine
            .removePrefix("path ")
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }
            .toSortedSet()
    }

    private fun repoRoot(): Path {
        var current = Path.of("").toAbsolutePath()
        repeat(8) {
            if (Files.exists(current.resolve("deploy/homeserver/caddy/Caddyfile")) &&
                Files.exists(current.resolve("tools/guards/public-api-read-caddy-paths.sot"))
            ) {
                return current
            }
            current = current.parent ?: error("repo root not found from ${Path.of("").toAbsolutePath()}")
        }
        error("repo root not found")
    }
}
