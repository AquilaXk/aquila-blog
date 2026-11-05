package com.back.global.web.logging

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object SensitiveQueryRedactor {
    const val DEFAULT_MAX_LENGTH = 512
    private const val REDACTED = "[REDACTED]"
    private const val MAX_DECODE_PASSES = 3
    private val controlCharRegex = Regex("[\\x00-\\x1F\\x7F]")
    private val queryPairSeparatorRegex = Regex("[&;]")
    private val queryTokenInTextRegex = Regex("(^|[?&;\\s])([A-Za-z0-9_.%-]+)=([^&?\\s]*)")
    private val exactSensitiveKeys =
        setOf(
            "code",
            "state",
            "token",
            "key",
            "secret",
            "password",
            "email",
            "apikey",
            "accesstoken",
            "refreshtoken",
            "sessionkey",
            "verificationtoken",
            "signature",
            "q",
            "kw",
            "query",
            "search",
            "keyword",
        )

    fun redactQuery(
        rawQuery: String?,
        maxLength: Int = DEFAULT_MAX_LENGTH,
    ): String {
        val sanitized = sanitize(rawQuery)
        if (sanitized.isBlank()) return "-"

        return sanitized
            .split(queryPairSeparatorRegex)
            .joinToString("&") { part -> redactQueryPart(part) }
            .take(maxLength)
    }

    fun redactText(
        raw: String?,
        maxLength: Int,
    ): String {
        val sanitized = sanitize(raw)
        if (sanitized.isBlank()) return "-"

        return queryTokenInTextRegex
            .replace(sanitized) { match ->
                val prefix = match.groupValues[1]
                val key = match.groupValues[2]
                val value = match.groupValues[3]
                if (isSensitiveKey(key)) {
                    val safeKey = sanitize(decodePercentBounded(key).substringBefore('='))
                    "$prefix$safeKey=$REDACTED"
                } else {
                    "$prefix$key=$value"
                }
            }.take(maxLength)
    }

    private fun redactQueryPart(part: String): String {
        val decodedPart = decodePercentBounded(part)
        if (
            queryPairSeparatorRegex.containsMatchIn(decodedPart) &&
            decodedPart.split(queryPairSeparatorRegex).any { segment -> isSensitiveKey(segment.substringBefore('=')) }
        ) {
            return decodedPart
                .split(queryPairSeparatorRegex)
                .joinToString("&") { segment -> redactSingleQueryPart(segment) }
        }
        return redactSingleQueryPart(part)
    }

    private fun redactSingleQueryPart(part: String): String {
        val separatorIndex = part.indexOf("=")
        val rawKey = if (separatorIndex >= 0) part.substring(0, separatorIndex) else part
        val key = sanitize(rawKey)
        if (key.isBlank()) return "-"

        if (isSensitiveKey(key)) {
            val safeKey = sanitize(decodePercentBounded(key).substringBefore('='))
            return "$safeKey=$REDACTED"
        }
        if (separatorIndex < 0) return key

        val value = sanitize(part.substring(separatorIndex + 1))
        return "$key=$value"
    }

    private fun isSensitiveKey(rawKey: String): Boolean =
        decodePercentPasses(rawKey).any { decoded ->
            isNormalizedSensitiveKey(decoded.substringBefore('='))
        }

    private fun isNormalizedSensitiveKey(candidate: String): Boolean {
        val normalized = candidate.filter { it.isLetterOrDigit() }.lowercase()
        return normalized in exactSensitiveKeys ||
            normalized.endsWith("token") ||
            normalized.endsWith("secret") ||
            normalized.endsWith("password") ||
            normalized.endsWith("email") ||
            normalized.endsWith("signature")
    }

    private fun decodePercentBounded(raw: String): String = decodePercentPasses(raw).last()

    private fun decodePercentPasses(raw: String): List<String> {
        val passes = mutableListOf(raw)
        var current = raw
        repeat(MAX_DECODE_PASSES) {
            val decoded = runCatching { URLDecoder.decode(current, StandardCharsets.UTF_8) }.getOrDefault(current)
            if (decoded == current) return passes
            passes += decoded
            current = decoded
        }
        return passes
    }

    private fun sanitize(raw: String?): String =
        raw
            .orEmpty()
            .replace('\r', ' ')
            .replace('\n', ' ')
            .replace('\t', ' ')
            .replace(controlCharRegex, "?")
            .trim()
}
