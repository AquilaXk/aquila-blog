package com.back.global.security.config

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.web.ErrorResponseSource
import com.back.global.web.ErrorResponseWriter
import com.back.global.web.application.ClientIpResolver
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.env.Environment
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/**
 * API 요청의 쿠키/JWT 인증을 SecurityContext로 연결하는 servlet filter입니다.
 *
 * 공개 API는 stale 인증 정보가 있어도 익명 요청으로 fallback하고,
 * 보호 API는 세션 만료와 IP 보안 실패를 명시적인 401 응답으로 변환합니다.
 */
@Component
class CustomAuthenticationFilter(
    private val authTokenExtractor: AuthTokenExtractor,
    private val accessTokenAuthenticationHandler: AccessTokenAuthenticationHandler,
    private val refreshTokenAuthenticationHandler: RefreshTokenAuthenticationHandler,
    private val clientIpResolver: ClientIpResolver,
    private val errorResponseWriter: ErrorResponseWriter,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
    private val apiCorsPolicy: ApiCorsPolicy,
    private val environment: Environment,
) : OncePerRequestFilter() {
    private val log = org.slf4j.LoggerFactory.getLogger(CustomAuthenticationFilter::class.java)
    private val protectedDocumentationPrefixes = listOf("/swagger-ui/", "/v3/api-docs")
    private val filteredPrefixes = listOf("/member/api/", "/post/api/", "/system/api/", "/ws/", "/sse/") + protectedDocumentationPrefixes

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val uri = request.requestURI
        if (!environment.matchesProfiles("prod") && protectedDocumentationPrefixes.any { uri.startsWith(it) }) {
            return true
        }
        return filteredPrefixes.none { uri.startsWith(it) }
    }

    override fun shouldNotFilterAsyncDispatch(): Boolean = false

    /**
     * 인증 실패 응답은 JSON API 계약과 CORS header를 유지해야 하므로 filter 안에서 변환합니다.
     */
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val isPublicApi = publicApiRequestMatcher.matches(request)

        try {
            try {
                authenticateIfPossible(request)
            } catch (e: AppException) {
                if (!isPublicApi) throw e
                // 공개 API는 잘못된 인증정보가 있어도 익명으로 계속 처리한다.
                SecurityContextHolder.clearContext()
            } catch (e: Exception) {
                val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
                log.warn(
                    "authentication_filter_fallback path={} publicApi={} reason={}",
                    path,
                    isPublicApi,
                    e::class.java.simpleName,
                    e,
                )
                if (!isPublicApi) {
                    throw AppException(ErrorCode.UNAUTHORIZED, "로그인 후 이용해주세요.")
                }
                // 공개 API는 예기치 못한 인증 오류에서도 익명으로 계속 처리한다.
                SecurityContextHolder.clearContext()
            }
            filterChain.doFilter(request, response)
        } catch (e: AppException) {
            apiCorsPolicy.applyResponseHeadersIfAllowed(request, response)
            errorResponseWriter.write(
                request = request,
                response = response,
                errorCode = e.errorCode,
                source = ErrorResponseSource.FILTER,
                rsData = e.rsData,
                cause = e,
            )
        }
    }

    /**
     * 기존 accessToken을 먼저 검증하고, 실패하면 refreshToken 회전 경로로 이동합니다.
     */
    private fun authenticateIfPossible(request: HttpServletRequest) {
        val tokens = authTokenExtractor.extract()
        val clientIp = clientIpResolver.resolve(request)

        if (tokens.apiKey.isBlank() && tokens.accessToken.isBlank() && tokens.refreshToken.isBlank()) return

        if (accessTokenAuthenticationHandler.authenticate(request, tokens, clientIp)) return
        refreshTokenAuthenticationHandler.authenticate(request, tokens, clientIp)
    }

    private fun sanitizeLogValue(
        raw: String?,
        maxLength: Int,
    ): String {
        if (raw.isNullOrBlank()) return "-"

        val sanitized =
            raw
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replace(LOG_CONTROL_CHAR_REGEX, "?")
                .trim()

        if (sanitized.isBlank()) return "-"
        return sanitized.take(maxLength)
    }

    companion object {
        private const val MAX_PATH_LENGTH = 512
        private val LOG_CONTROL_CHAR_REGEX = Regex("[\\x00-\\x1F\\x7F]")
    }
}
