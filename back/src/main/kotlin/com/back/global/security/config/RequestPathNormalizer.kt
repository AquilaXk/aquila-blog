package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest

object RequestPathNormalizer {
    private const val MAX_DECODE_PASSES = 3
    private val MULTIPLE_SLASH_REGEX = Regex("/+")
    private const val ATTR_RAW_URI = "com.back.RequestPathNormalizer.rawUri"
    private const val ATTR_CONTEXT_PATH = "com.back.RequestPathNormalizer.contextPath"
    private const val ATTR_NORMALIZED_PATH = "com.back.RequestPathNormalizer.normalizedPath"

    fun normalize(request: HttpServletRequest): String {
        val rawUri = request.requestURI.takeIf { !it.isNullOrBlank() } ?: request.servletPath.orEmpty()
        val contextPath = request.contextPath
        val cachedNormalized = request.getAttribute(ATTR_NORMALIZED_PATH) as? String
        if (
            cachedNormalized != null &&
            request.getAttribute(ATTR_RAW_URI) == rawUri &&
            request.getAttribute(ATTR_CONTEXT_PATH) == contextPath
        ) {
            return cachedNormalized
        }
        val normalized = normalizePath(rawUri, contextPath)
        request.setAttribute(ATTR_RAW_URI, rawUri)
        request.setAttribute(ATTR_CONTEXT_PATH, contextPath)
        request.setAttribute(ATTR_NORMALIZED_PATH, normalized)
        return normalized
    }

    fun normalizePath(
        rawUri: String?,
        contextPath: String? = null,
    ): String {
        val raw = rawUri.orEmpty()
        val hasContext = !contextPath.isNullOrBlank()
        if (!hasContext && isCleanNormalizedPath(raw)) {
            return raw
        }

        val uriWithoutQuery = raw.substringBefore('?')
        val normalizedContext = contextPath?.trim().orEmpty()
        val strippedContextUri =
            if (normalizedContext.isNotBlank() && uriWithoutQuery.startsWith(normalizedContext)) {
                uriWithoutQuery.removePrefix(normalizedContext)
            } else {
                uriWithoutQuery
            }
        if (isCleanNormalizedPath(strippedContextUri)) {
            return strippedContextUri
        }

        val preStripped = stripMatrixParametersPerSegment(strippedContextUri)
        val decoded = decodePercentEncodedIteratively(preStripped).replace('\\', '/')
        val collapsed = MULTIPLE_SLASH_REGEX.replace(decoded, "/")
        if (collapsed.isBlank() || collapsed == "/") return "/"

        val preserveTrailingSlash = collapsed.length > 1 && collapsed.endsWith('/')
        val segments = ArrayDeque<String>()
        for (rawSegment in collapsed.split('/', '\\')) {
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

    private fun isCleanNormalizedPath(path: String): Boolean {
        val len = path.length
        if (len == 0 || path[0] != '/') return false
        if (len == 1) return true
        var prev = '/'
        for (i in 1 until len) {
            val ch = path[i]
            when {
                ch == '?' || ch == '%' || ch == '\\' || ch == ';' -> return false
                ch == '/' && prev == '/' -> return false
                prev == '/' && ch == '.' -> {
                    if (i + 1 == len || path[i + 1] == '/' || (path[i + 1] == '.' && (i + 2 == len || path[i + 2] == '/'))) {
                        return false
                    }
                }
            }
            prev = ch
        }
        return true
    }

    private fun stripMatrixParametersPerSegment(path: String): String =
        path
            .split('/', '\\')
            .joinToString("/") { it.substringBefore(';') }

    private fun decodePercentEncodedIteratively(input: String): String {
        var current = input
        repeat(MAX_DECODE_PASSES) {
            if (!current.contains('%')) return current
            val next = stripMatrixParametersPerSegment(decodePercentEncodedSafely(current))
            if (next == current) return current
            current = next
        }
        return current
    }

    internal fun decodePercentEncodedSafely(input: String): String {
        if (input.indexOf('%') < 0) return input
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
