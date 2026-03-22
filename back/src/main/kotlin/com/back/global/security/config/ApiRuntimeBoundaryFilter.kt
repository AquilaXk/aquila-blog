package com.back.global.security.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * ApiRuntimeBoundaryFilter는 런타임 모드(all/read/admin)에 따라 API 경계를 분리한다.
 * 기본(all)에서는 동작하지 않으며, read/admin 모드에서만 요청 경계 차단을 수행한다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
class ApiRuntimeBoundaryFilter(
    @param:Value("\${custom.runtime.apiMode:all}")
    apiModeRaw: String,
) : OncePerRequestFilter() {
    private val mode = RuntimeApiMode.from(apiModeRaw)
    private val apiPathRegex = Regex("^/[^/]+/api/.*")

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        if (mode == RuntimeApiMode.ALL) return true
        val path = requestPath(request)
        if (path.startsWith("/actuator/")) return true
        return !apiPathRegex.matches(path)
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val method = request.method.uppercase()
        val path = requestPath(request)

        if (isAllowed(mode, method, path)) {
            filterChain.doFilter(request, response)
            return
        }

        response.status = HttpServletResponse.SC_SERVICE_UNAVAILABLE
        response.setHeader("Retry-After", "1")
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = Charsets.UTF_8.name()
        response.writer.write("""{"resultCode":"503-1","msg":"현재 런타임 모드에서 차단된 API입니다."}""")
    }

    private fun isAllowed(
        mode: RuntimeApiMode,
        method: String,
        path: String,
    ): Boolean {
        val isPublicReadApi = isPublicReadPath(path) && method in SAFE_METHODS
        return when (mode) {
            RuntimeApiMode.ALL -> true
            RuntimeApiMode.READ -> isPublicReadApi
            RuntimeApiMode.ADMIN -> !isPublicReadApi
        }
    }

    private fun isPublicReadPath(path: String): Boolean = PUBLIC_READ_PATHS.any { it.matches(path) } || PUBLIC_DETAIL_PATH.matches(path)

    private fun requestPath(request: HttpServletRequest): String {
        val contextPath = request.contextPath.orEmpty()
        val uri = request.requestURI.orEmpty()
        return if (contextPath.isNotBlank() && uri.startsWith(contextPath)) {
            uri.removePrefix(contextPath)
        } else {
            uri
        }
    }

    private enum class RuntimeApiMode {
        ALL,
        READ,
        ADMIN,
        ;

        companion object {
            fun from(raw: String): RuntimeApiMode =
                when (raw.trim().lowercase()) {
                    "read", "reader" -> READ
                    "admin", "write", "writer" -> ADMIN
                    else -> ALL
                }
        }
    }

    companion object {
        private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
        private val PUBLIC_READ_PATHS =
            listOf(
                Regex("^/post/api/v1/posts/feed$"),
                Regex("^/post/api/v1/posts/feed/cursor$"),
                Regex("^/post/api/v1/posts/explore$"),
                Regex("^/post/api/v1/posts/explore/cursor$"),
                Regex("^/post/api/v1/posts/search$"),
                Regex("^/post/api/v1/posts/tags$"),
                Regex("^/post/api/v1/posts$"),
            )
        private val PUBLIC_DETAIL_PATH = Regex("^/post/api/v1/posts/\\d+$")
    }
}
