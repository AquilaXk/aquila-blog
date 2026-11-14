package com.back.global.web.logging

import com.back.global.security.config.RequestPathNormalizer

object SensitiveQueryRedactor {
    const val DEFAULT_MAX_LENGTH = 512
    private const val REDACTED = "[REDACTED]"
    private const val MAX_DECODE_PASSES = 3
    private val queryTokenInTextRegex = Regex("(^|[?&;\\s])([A-Za-z0-9_.%-]+(?:=|%(?:25)*3[dD])[^&?;\\s]*)")
    private val exactSensitiveKeys =
        arrayOf(
            "code",
            "state",
            "key",
            "apikey",
            "sessionkey",
            "q",
            "kw",
            "query",
            "search",
            "keyword",
        )
    private val sensitiveKeySuffixes =
        arrayOf(
            "token",
            "secret",
            "password",
            "email",
            "signature",
        )

    fun redactQuery(
        rawQuery: String?,
        maxLength: Int = DEFAULT_MAX_LENGTH,
    ): String {
        val sanitized = sanitize(rawQuery)
        if (sanitized.isBlank()) return "-"

        val out = StringBuilder(minOf(sanitized.length + 16, maxLength))
        val len = sanitized.length
        var start = 0
        while (start <= len) {
            val sep = nextPairSeparator(sanitized, start, len)
            if (start > 0) {
                out.append('&')
            }
            val redactedPart = redactQueryPart(sanitized.substring(start, sep))
            val remaining = maxLength - out.length
            if (redactedPart.length >= remaining) {
                out.append(redactedPart, 0, remaining)
                break
            }
            out.append(redactedPart)
            if (sep >= len) break
            start = sep + 1
        }
        return out.toString()
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
        if (raw.indexOf('%') < 0) return listOf(raw)
        val passes = ArrayList<String>(maxPasses + 1)
        passes += raw
        var current = raw
        repeat(maxPasses) {
            if (current.indexOf('%') < 0) return passes
            val decoded = RequestPathNormalizer.decodePercentEncodedSafely(current)
            if (decoded == current) return passes
            passes += decoded
            current = decoded
        }
        return passes
    }

    private fun redactQueryPart(part: String): String {
        val decodedPart = decodePercentBounded(part)
        if (containsPairSeparator(decodedPart) && anyDecodedSegmentSensitive(decodedPart)) {
            val out = StringBuilder(decodedPart.length + 16)
            val len = decodedPart.length
            var start = 0
            while (start <= len) {
                val sep = nextPairSeparator(decodedPart, start, len)
                if (start > 0) out.append('&')
                out.append(redactSingleQueryPart(decodedPart.substring(start, sep)))
                if (sep >= len) break
                start = sep + 1
            }
            return out.toString()
        }
        return redactSingleQueryPart(part)
    }

    private fun anyDecodedSegmentSensitive(decodedPart: String): Boolean {
        val len = decodedPart.length
        var start = 0
        while (start <= len) {
            val sep = nextPairSeparator(decodedPart, start, len)
            val eqIndex = decodedPart.indexOf('=', start)
            val keyEnd = if (eqIndex in start until sep) eqIndex else sep
            if (isSensitiveKey(decodedPart.substring(start, keyEnd))) return true
            if (sep >= len) break
            start = sep + 1
        }
        return false
    }

    private fun containsPairSeparator(value: String): Boolean {
        for (i in 0 until value.length) {
            val ch = value[i]
            if (ch == '&' || ch == ';') return true
        }
        return false
    }

    private fun nextPairSeparator(
        value: String,
        start: Int,
        len: Int,
    ): Int {
        var i = start
        while (i < len) {
            val ch = value[i]
            if (ch == '&' || ch == ';') return i
            i++
        }
        return len
    }

    private fun redactSingleQueryPart(part: String): String {
        val separatorIndex = part.indexOf('=')
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

    private fun isSensitiveKey(rawKey: String): Boolean {
        if (rawKey.indexOf('%') < 0) {
            return isNormalizedSensitiveKey(beforeEquals(rawKey))
        }
        val passes = decodePercentPasses(rawKey)
        for (i in 0 until passes.size) {
            if (isNormalizedSensitiveKey(beforeEquals(passes[i]))) return true
        }
        return false
    }

    private fun beforeEquals(raw: String): String {
        val eqIndex = raw.indexOf('=')
        return if (eqIndex >= 0) raw.substring(0, eqIndex) else raw
    }

    private fun isNormalizedSensitiveKey(candidate: String): Boolean {
        for (i in 0 until sensitiveKeySuffixes.size) {
            if (endsWithNormalizedAscii(candidate, sensitiveKeySuffixes[i])) return true
        }
        for (i in 0 until exactSensitiveKeys.size) {
            if (equalsNormalizedAscii(candidate, exactSensitiveKeys[i])) return true
        }
        return false
    }

    private fun endsWithNormalizedAscii(
        candidate: String,
        asciiLowerSuffix: String,
    ): Boolean {
        var ci = candidate.lastIndex
        var si = asciiLowerSuffix.lastIndex
        while (si >= 0) {
            while (ci >= 0 && !candidate[ci].isLetterOrDigit()) ci--
            if (ci < 0) return false
            if (foldAsciiLower(candidate[ci]) != asciiLowerSuffix[si].code) return false
            ci--
            si--
        }
        return true
    }

    private fun equalsNormalizedAscii(
        candidate: String,
        asciiLowerTarget: String,
    ): Boolean {
        var ci = 0
        val cLen = candidate.length
        var ti = 0
        val tLen = asciiLowerTarget.length
        while (ti < tLen) {
            while (ci < cLen && !candidate[ci].isLetterOrDigit()) ci++
            if (ci >= cLen) return false
            if (foldAsciiLower(candidate[ci]) != asciiLowerTarget[ti].code) return false
            ci++
            ti++
        }
        while (ci < cLen) {
            if (candidate[ci].isLetterOrDigit()) return false
            ci++
        }
        return true
    }

    private fun foldAsciiLower(ch: Char): Int = if (ch in 'A'..'Z') ch.code or 0x20 else ch.code

    private fun decodePercentBounded(raw: String): String = if (raw.indexOf('%') < 0) raw else decodePercentPasses(raw).last()

    private fun sanitize(raw: String?): String {
        if (raw.isNullOrEmpty()) return ""
        val len = raw.length
        var start = 0
        while (start < len && isTrimmedSpaceOrLineBreak(raw[start])) start++
        var end = len
        while (end > start && isTrimmedSpaceOrLineBreak(raw[end - 1])) end--
        if (start >= end) return ""

        var dirty = false
        for (i in start until end) {
            val code = raw[i].code
            if (code <= 0x1F || code == 0x7F) {
                dirty = true
                break
            }
        }
        if (!dirty) {
            return if (start == 0 && end == len) raw else raw.substring(start, end)
        }

        val out = StringBuilder(end - start)
        for (i in start until end) {
            val ch = raw[i]
            val code = ch.code
            out.append(
                when {
                    ch == '\r' || ch == '\n' || ch == '\t' -> ' '
                    code <= 0x1F || code == 0x7F -> '?'
                    else -> ch
                },
            )
        }
        return out.toString()
    }

    private fun isTrimmedSpaceOrLineBreak(ch: Char): Boolean = ch == ' ' || ch == '\r' || ch == '\n' || ch == '\t'
}
