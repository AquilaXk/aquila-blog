package com.back.global.web.logging

object SensitiveQueryRedactor {
    const val DEFAULT_MAX_LENGTH = 512
    private const val REDACTED = "[REDACTED]"
    private const val MAX_DECODE_PASSES = 3
    private val controlCharRegex = Regex("[\\x00-\\x1F\\x7F]")
    private val queryPairSeparatorRegex = Regex("[&;]")
    private val queryTokenInTextRegex = Regex("(^|[?&;\\s])([A-Za-z0-9_.%-]+(?:=|%(?:25)*3[dD])[^&?;\\s]*)")
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
                val token = match.groupValues[2]
                "$prefix${redactQueryPart(token)}"
            }.take(maxLength)
    }

    fun decodePercentPasses(
        raw: String,
        maxPasses: Int = MAX_DECODE_PASSES,
    ): List<String> {
        val passes = mutableListOf(raw)
        var current = raw
        repeat(maxPasses) {
            val decoded = decodePercentEncodedSafely(current)
            if (decoded == current) return passes
            passes += decoded
            current = decoded
        }
        return passes
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

    private fun decodePercentEncodedSafely(input: String): String {
        val out = StringBuilder(input.length)
        val byteBuffer = ByteArray(input.length / 3 + 1)
        var index = 0
        while (index < input.length) {
            if (isPercentHexTriplet(input, index)) {
                var byteCount = 0
                while (isPercentHexTriplet(input, index)) {
                    val high = hexDigitValue(input[index + 1])
                    val low = hexDigitValue(input[index + 2])
                    val decodedByte = (high shl 4) or low
                    byteBuffer[byteCount++] = if (decodedByte == 0) '?'.code.toByte() else decodedByte.toByte()
                    index += 3
                }
                out.append(String(byteBuffer, 0, byteCount, Charsets.UTF_8))
            } else {
                out.append(input[index])
                index += 1
            }
        }
        return out.toString()
    }

    private fun isPercentHexTriplet(
        input: String,
        index: Int,
    ): Boolean =
        index + 2 < input.length &&
            input[index] == '%' &&
            hexDigitValue(input[index + 1]) >= 0 &&
            hexDigitValue(input[index + 2]) >= 0

    private fun hexDigitValue(ch: Char): Int =
        when (ch) {
            in '0'..'9' -> ch - '0'
            in 'a'..'f' -> ch - 'a' + 10
            in 'A'..'F' -> ch - 'A' + 10
            else -> -1
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
