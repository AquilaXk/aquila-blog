package com.back.boundedContexts.post.adapter.web

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@Component
class PostPublicReadEtagSupport {
    fun toWeakEtag(seed: String): String {
        val digest =
            MessageDigest
                .getInstance("SHA-256")
                .digest(seed.toByteArray(StandardCharsets.UTF_8))
                .joinToString("") { each -> "%02x".format(each) }
                .take(32)
        return "W/\"$digest\""
    }

    fun isNotModified(
        request: HttpServletRequest,
        etag: String,
    ): Boolean {
        val ifNoneMatch = request.getHeader(HttpHeaders.IF_NONE_MATCH)?.trim().orEmpty()
        if (ifNoneMatch.isBlank()) return false
        if (ifNoneMatch == "*") return true

        val expected = normalizeEtagToken(etag)
        return ifNoneMatch
            .split(",")
            .asSequence()
            .map { normalizeEtagToken(it) }
            .any { it == expected }
    }

    private fun normalizeEtagToken(raw: String): String = raw.trim().removePrefix("W/").removePrefix("w/")
}
