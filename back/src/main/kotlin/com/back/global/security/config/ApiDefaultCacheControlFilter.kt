package com.back.global.security.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * 공개 read API는 컨트롤러에서 명시한 cache policy를 그대로 사용하고,
 * 그 외 API 응답은 Cache-Control 누락 시 no-store 기본값을 보강한다.
 */
@Component
class ApiDefaultCacheControlFilter : OncePerRequestFilter() {
    private val apiPathRegex = Regex("^/[^/]+/api/.*")

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val path = requestPath(request)
        return !apiPathRegex.matches(path)
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        filterChain.doFilter(request, response)

        if (response.isCommitted) return
        if (response.containsHeader(HttpHeaders.CACHE_CONTROL)) return

        response.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0")
        response.setHeader(HttpHeaders.PRAGMA, "no-cache")
        response.setDateHeader(HttpHeaders.EXPIRES, 0)
    }

    private fun requestPath(request: HttpServletRequest): String {
        val contextPath = request.contextPath.orEmpty()
        val uri = request.requestURI.orEmpty()
        return if (contextPath.isNotBlank() && uri.startsWith(contextPath)) {
            uri.removePrefix(contextPath)
        } else {
            uri
        }
    }
}
