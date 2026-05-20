package com.back.global.security.config

import com.back.global.rsData.RsData
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.ObjectMapper

/**
 * 쿠키 인증 mutation 요청은 브라우저가 CORS preflight를 수행할 수 있는 custom header를 요구한다.
 */
class ApiMutationCsrfGuardFilter(
    private val apiCorsPolicy: ApiCorsPolicy,
    private val objectMapper: ObjectMapper,
) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val method = request.method.uppercase()
        if (method == "OPTIONS" || method in SAFE_METHODS) return true
        if (!API_PATH_REGEX.matches(requestPath(request))) return true
        return !hasAuthCookie(request)
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val origin = request.getHeader(HttpHeaders.ORIGIN)?.trim().orEmpty()
        if (origin.isNotBlank() && !apiCorsPolicy.isAllowedOrigin(origin)) {
            writeForbidden(response, "403-2", "허용되지 않은 Origin의 요청입니다.")
            return
        }

        if (request.getHeader(CSRF_PREFLIGHT_HEADER)?.trim() != CSRF_PREFLIGHT_VALUE) {
            apiCorsPolicy.applyResponseHeadersIfAllowed(request, response)
            writeForbidden(response, "403-3", "CSRF preflight 헤더가 필요합니다.")
            return
        }

        filterChain.doFilter(request, response)
    }

    private fun hasAuthCookie(request: HttpServletRequest): Boolean =
        request.cookies
            ?.any { cookie -> cookie.name in AUTH_COOKIE_NAMES && cookie.value.isNotBlank() }
            ?: false

    private fun requestPath(request: HttpServletRequest): String {
        val contextPath = request.contextPath.orEmpty()
        val uri = request.requestURI.orEmpty()
        return if (contextPath.isNotBlank() && uri.startsWith(contextPath)) {
            uri.removePrefix(contextPath)
        } else {
            uri
        }
    }

    private fun writeForbidden(
        response: HttpServletResponse,
        resultCode: String,
        message: String,
    ) {
        response.status = HttpServletResponse.SC_FORBIDDEN
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = Charsets.UTF_8.name()
        response.writer.write(objectMapper.writeValueAsString(RsData<Void>(resultCode, message)))
    }

    companion object {
        const val CSRF_PREFLIGHT_HEADER = "X-Aquila-CSRF"
        const val CSRF_PREFLIGHT_VALUE = "1"

        private val SAFE_METHODS = setOf("GET", "HEAD")
        private val AUTH_COOKIE_NAMES = setOf("apiKey", "accessToken", "sessionKey")
        private val API_PATH_REGEX = Regex("^/[^/]+/api/.*")
    }
}
