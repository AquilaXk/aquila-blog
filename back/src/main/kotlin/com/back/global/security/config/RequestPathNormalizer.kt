package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest

object RequestPathNormalizer {
    private val MULTIPLE_SLASH_REGEX = Regex("/+")

    fun normalize(request: HttpServletRequest): String {
        val rawUri = request.requestURI.takeIf { !it.isNullOrBlank() } ?: request.servletPath.orEmpty()
        return normalizePath(rawUri, request.contextPath)
    }

    fun normalizePath(
        rawUri: String?,
        contextPath: String? = null,
    ): String {
        val uriWithoutQuery = rawUri.orEmpty().substringBefore('?')
        val normalizedContext = contextPath?.trim().orEmpty()
        val strippedContextUri =
            if (normalizedContext.isNotBlank() && uriWithoutQuery.startsWith(normalizedContext)) {
                uriWithoutQuery.removePrefix(normalizedContext)
            } else {
                uriWithoutQuery
            }

        val decoded = decodePercentEncodedSafely(strippedContextUri).replace('\\', '/')
        val collapsed = MULTIPLE_SLASH_REGEX.replace(decoded, "/")
        if (collapsed.isBlank() || collapsed == "/") return "/"

        val preserveTrailingSlash = collapsed.length > 1 && collapsed.endsWith('/')
        val segments = ArrayDeque<String>()
        for (rawSegment in collapsed.split('/')) {
            val segment = rawSegment.substringBefore(';')
            when (segment) {
                "", "." -> Unit
                ".." -> if (segments.isNotEmpty()) segments.removeLast()
                else -> segments.addLast(segment)
            }
        }

        if (segments.isEmpty()) return "/"
        val joined = "/" + segments.joinToString("/")
        return if (preserveTrailingSlash) "$joined/" else joined
    }

    private fun decodePercentEncodedSafely(input: String): String {
        if (!input.contains('%')) return input

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
}
