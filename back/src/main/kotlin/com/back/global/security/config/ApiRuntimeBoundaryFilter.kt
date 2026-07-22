package com.back.global.security.config

import com.back.global.exception.application.ErrorCode
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
 * ApiRuntimeBoundaryFilter는 런타임 모드(all/read/admin/worker/none)에 따라 API 경계를 분리한다.
 * 기본(all)에서는 동작하지 않으며, 그 외 모드에서 요청 경계 차단을 수행한다.
 * public-read 판정은 [PublicApiRequestMatcher] SoT를 공유한다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
class ApiRuntimeBoundaryFilter(
    @Value("\${custom.runtime.apiMode:all}")
    apiModeRaw: String,
    private val apiCorsPolicy: ApiCorsPolicy?,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
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

        apiCorsPolicy?.applyResponseHeadersIfAllowed(request, response)
        response.status = ErrorCode.SERVICE_UNAVAILABLE.status.value()
        response.setHeader("Retry-After", "1")
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = Charsets.UTF_8.name()
        val body = ErrorCode.SERVICE_UNAVAILABLE.toRsData("현재 런타임 모드에서 차단된 API입니다.")
        response.writer.write("""{"resultCode":"${body.resultCode}","msg":"${body.msg}"}""")
    }

    private fun isAllowed(
        mode: RuntimeApiMode,
        method: String,
        path: String,
    ): Boolean {
        // CORS preflight는 실제 메서드 권한 판단 이전에 항상 통과시켜야 브라우저가 본 요청 결과를 해석할 수 있다.
        if (method == "OPTIONS") return true

        val isPublicReadApi = publicApiRequestMatcher.isPublicReadSafe(method, path)
        return when (mode) {
            RuntimeApiMode.ALL -> true
            RuntimeApiMode.READ -> isPublicReadApi
            RuntimeApiMode.ADMIN -> !isPublicReadApi
            RuntimeApiMode.WORKER, RuntimeApiMode.NONE -> false
        }
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
