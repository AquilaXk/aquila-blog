package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.member.subContexts.session.model.MemberSessionAuthSnapshot
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import com.back.global.web.application.Rq
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.env.Environment
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.Locale

/**
 * API 요청의 쿠키/JWT 인증을 SecurityContext로 연결하는 servlet filter입니다.
 *
 * 공개 API는 stale 인증 정보가 있어도 익명 요청으로 fallback하고,
 * 보호 API는 세션 만료와 IP 보안 실패를 명시적인 401 응답으로 변환합니다.
 */
@Component
class CustomAuthenticationFilter(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val authTokenExtractor: AuthTokenExtractor,
    private val authIpSecurityVerifier: AuthIpSecurityVerifier,
    private val clientIpResolver: ClientIpResolver,
    private val objectMapper: ObjectMapper,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
    private val apiCorsPolicy: ApiCorsPolicy,
    private val environment: Environment,
    private val rq: Rq,
    @param:Value("\${custom.auth.session.freshLookupGraceSeconds:15}")
    private val freshLookupGraceSeconds: Long,
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
                authenticateIfPossible(request, response)
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
                    throw AppException("401-1", "로그인 후 이용해주세요.")
                }
                // 공개 API는 예기치 못한 인증 오류에서도 익명으로 계속 처리한다.
                SecurityContextHolder.clearContext()
            }
            filterChain.doFilter(request, response)
        } catch (e: AppException) {
            if (response.isCommitted) {
                val path = sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH)
                log.warn(
                    "authentication_app_exception_response_committed path={} code={}",
                    path,
                    e.rsData.resultCode,
                    e,
                )
                return
            }
            val rsData: RsData<Void> = e.rsData

            apiCorsPolicy.applyResponseHeadersIfAllowed(request, response)
            response.contentType = "$APPLICATION_JSON_VALUE; charset=UTF-8"
            response.status = rsData.statusCode
            response.writer.write(objectMapper.writeValueAsString(rsData))
        }
    }

    /**
     * 기존 accessToken을 먼저 검증하고, 실패하면 refreshToken 회전 경로로 이동합니다.
     */
    private fun authenticateIfPossible(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val tokens = authTokenExtractor.extract()
        val apiKey = tokens.apiKey
        val accessToken = tokens.accessToken
        val sessionKey = tokens.sessionKey
        val refreshToken = tokens.refreshToken
        val clientIp = clientIpResolver.resolve(request)

        if (apiKey.isBlank() && accessToken.isBlank() && refreshToken.isBlank()) return

        val payload = accessToken.takeIf { it.isNotBlank() }?.let(actorApplicationService::payload)

        if (payload != null) {
            // 쓰기 요청은 apiKey 기준 DB 회원을 우선 사용해 role 드리프트(특히 관리자 403 오탐)를 방지한다.
            if (shouldPreferApiKeyAuthorityOnWrite(request, apiKey)) {
                val apiKeyMember = actorApplicationService.findByApiKey(apiKey)
                if (apiKeyMember != null) {
                    val sessionResolution = resolveMemberSession(apiKeyMember.id, sessionKey, payload.sessionKey, payload, request)
                    ensureSessionIsUsable(sessionResolution, requireSession = true)
                    val memberSession = sessionResolution.session
                    val rememberLoginEnabled = memberSession?.rememberLoginEnabled ?: apiKeyMember.rememberLoginEnabled
                    val ipSecurityEnabled = memberSession?.ipSecurityEnabled ?: apiKeyMember.ipSecurityEnabled
                    val ipSecurityFingerprint = memberSession?.ipSecurityFingerprint ?: apiKeyMember.ipSecurityFingerprint

                    authIpSecurityVerifier.verify(
                        AuthIpSecurityCheck(
                            memberId = apiKeyMember.id,
                            loginIdentifier = apiKeyMember.username,
                            rememberLoginEnabled = rememberLoginEnabled,
                            ipSecurityEnabled = ipSecurityEnabled,
                            expectedIpFingerprint = ipSecurityFingerprint,
                            requestPath = request.requestURI,
                            reason = "apikey-ip-mismatch",
                        ),
                        clientIp,
                    )

                    val rotatedAccessToken =
                        actorApplicationService.genAccessToken(
                            member = apiKeyMember,
                            sessionKey = memberSession?.sessionKey,
                            rememberLoginEnabled = rememberLoginEnabled,
                            ipSecurityEnabled = ipSecurityEnabled,
                            ipSecurityFingerprint = ipSecurityFingerprint,
                        )
                    authCookieService.issueAccessToken(
                        accessToken = rotatedAccessToken,
                        rememberLoginEnabled = rememberLoginEnabled,
                        sessionKey = memberSession?.sessionKey,
                    )
                    rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $rotatedAccessToken")
                    memberSession?.let { memberSessionUseCase.touchAuthenticated(it) }
                    authenticate(apiKeyMember)
                    return
                }
            }

            val sessionResolution = resolveMemberSession(payload.id, sessionKey, payload.sessionKey, payload, request)
            ensureSessionIsUsable(sessionResolution, requireSession = true)
            val memberSession = sessionResolution.session
            val rememberLoginEnabled = memberSession?.rememberLoginEnabled ?: payload.rememberLoginEnabled
            val ipSecurityEnabled = memberSession?.ipSecurityEnabled ?: payload.ipSecurityEnabled
            val ipSecurityFingerprint = memberSession?.ipSecurityFingerprint ?: payload.ipSecurityFingerprint
            val tokenLoginIdentifier = resolveTokenLoginIdentifier(payload)
            authIpSecurityVerifier.verify(
                AuthIpSecurityCheck(
                    memberId = payload.id,
                    loginIdentifier = tokenLoginIdentifier,
                    rememberLoginEnabled = rememberLoginEnabled,
                    ipSecurityEnabled = ipSecurityEnabled,
                    expectedIpFingerprint = ipSecurityFingerprint,
                    requestPath = request.requestURI,
                    reason = "token-payload-ip-mismatch",
                ),
                clientIp,
            )

            // 과거 토큰(payload.email 누락)과 현재 이메일 기반 관리자 판정의 드리프트를 즉시 복구한다.
            if (payload.email.isNullOrBlank()) {
                actorApplicationService.findById(payload.id)?.let { persistedMember ->
                    val rotatedAccessToken =
                        actorApplicationService.genAccessToken(
                            member = persistedMember,
                            sessionKey = memberSession?.sessionKey,
                            rememberLoginEnabled = rememberLoginEnabled,
                            ipSecurityEnabled = ipSecurityEnabled,
                            ipSecurityFingerprint = ipSecurityFingerprint,
                        )
                    authCookieService.issueAccessToken(
                        accessToken = rotatedAccessToken,
                        rememberLoginEnabled = rememberLoginEnabled,
                        sessionKey = memberSession?.sessionKey,
                    )
                    rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $rotatedAccessToken")
                    memberSession?.let { memberSessionUseCase.touchAuthenticated(it) }
                    authenticate(persistedMember)
                    return
                }
            }

            memberSession?.let { memberSessionUseCase.touchAuthenticated(it) }
            val payloadMember =
                Member(
                    id = payload.id,
                    username = resolvePrincipalUsername(payload),
                    password = null,
                    nickname = payload.name,
                    email = payload.email,
                )
            authenticate(payloadMember)
            return
        }

        if (sessionKey.isBlank() || refreshToken.isBlank()) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }

        val refreshedSession =
            memberSessionUseCase.rotateRefreshToken(sessionKey, refreshToken)
                ?: run {
                    authCookieService.expireAuthCookies()
                    throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
                }

        val memberSession = refreshedSession.session
        val member = memberSession.member
        val rememberLoginEnabled = memberSession.rememberLoginEnabled
        val ipSecurityEnabled = memberSession.ipSecurityEnabled
        val ipSecurityFingerprint = memberSession.ipSecurityFingerprint

        authIpSecurityVerifier.verify(
            AuthIpSecurityCheck(
                memberId = member.id,
                loginIdentifier = member.username,
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                expectedIpFingerprint = ipSecurityFingerprint,
                requestPath = request.requestURI,
                reason = "refresh-token-ip-mismatch",
                revokeSessionKey = memberSession.sessionKey,
            ),
            clientIp,
        )

        val newAccessToken =
            actorApplicationService.genAccessToken(
                member = member,
                sessionKey = memberSession.sessionKey,
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                ipSecurityFingerprint = ipSecurityFingerprint,
            )
        authCookieService.issueAccessToken(
            accessToken = newAccessToken,
            rememberLoginEnabled = rememberLoginEnabled,
            sessionKey = memberSession.sessionKey,
            refreshToken = refreshedSession.refreshToken,
        )
        rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $newAccessToken")

        authenticate(member)
    }

    /**
     * authenticate 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    private fun authenticate(member: Member) {
        val user: UserDetails =
            SecurityUser(
                member.id,
                member.username,
                "",
                member.name,
                member.toGrantedAuthorities(),
            )

        val authentication: Authentication =
            UsernamePasswordAuthenticationToken(user, user.password, user.authorities)

        SecurityContextHolder.getContext().authentication = authentication
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
        private val MUTATING_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")
        private val SAFE_METHODS = setOf("GET", "HEAD")
    }

    private data class SessionResolution(
        val sessionKeyProvided: Boolean,
        val session: MemberSessionAuthSnapshot?,
        val freshTokenFallback: Boolean = false,
    )

    private fun resolveMemberSession(
        memberId: Long,
        cookieSessionKey: String,
        tokenSessionKey: String?,
        payload: AccessTokenPayload?,
        request: HttpServletRequest,
    ): SessionResolution {
        val effectiveSessionKey =
            when {
                cookieSessionKey.isNotBlank() -> cookieSessionKey
                !tokenSessionKey.isNullOrBlank() -> tokenSessionKey
                else -> ""
            }.trim()

        if (effectiveSessionKey.isBlank()) {
            return SessionResolution(sessionKeyProvided = false, session = null)
        }

        val resolution =
            SessionResolution(
                sessionKeyProvided = true,
                session = memberSessionUseCase.findActiveSessionSnapshot(memberId, effectiveSessionKey),
            )

        if (resolution.session != null || !resolution.sessionKeyProvided) return resolution
        if (!canUseFreshTokenSessionFallback(request, payload, cookieSessionKey, effectiveSessionKey)) return resolution

        log.info(
            "auth_session_fresh_token_fallback path={} memberId={} graceSeconds={}",
            sanitizeLogValue(request.requestURI, MAX_PATH_LENGTH),
            memberId,
            freshLookupGraceSeconds,
        )

        return resolution.copy(freshTokenFallback = true)
    }

    private fun ensureSessionIsUsable(
        sessionResolution: SessionResolution,
        requireSession: Boolean = false,
    ) {
        if (!sessionResolution.sessionKeyProvided && requireSession) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }

        if (sessionResolution.sessionKeyProvided && sessionResolution.session == null && !sessionResolution.freshTokenFallback) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }
    }

    private fun canUseFreshTokenSessionFallback(
        request: HttpServletRequest,
        payload: AccessTokenPayload?,
        cookieSessionKey: String,
        effectiveSessionKey: String,
    ): Boolean {
        if (payload == null) return false
        if (freshLookupGraceSeconds <= 0) return false
        val method =
            request.method
                ?.trim()
                ?.uppercase(Locale.ROOT)
                .orEmpty()
        if (method !in SAFE_METHODS) return false
        if (cookieSessionKey.isBlank() || effectiveSessionKey.isBlank()) return false
        if (payload.sessionKey.isNullOrBlank() || payload.sessionKey != effectiveSessionKey) return false

        val issuedAt = payload.issuedAt ?: return false
        return !Instant.now().isAfter(issuedAt.plusSeconds(freshLookupGraceSeconds))
    }

    private fun resolveTokenLoginIdentifier(payload: AccessTokenPayload): String? {
        val normalizedEmail = payload.email?.trim().orEmpty()
        if (normalizedEmail.isNotBlank()) return normalizedEmail

        val normalizedUsername = payload.username?.trim().orEmpty()
        if (normalizedUsername.isNotBlank()) return normalizedUsername
        return null
    }

    private fun resolvePrincipalUsername(payload: AccessTokenPayload): String {
        val normalizedUsername = payload.username?.trim().orEmpty()
        if (normalizedUsername.isNotBlank()) return normalizedUsername

        val normalizedEmail = payload.email?.trim().orEmpty()
        if (normalizedEmail.isNotBlank()) return normalizedEmail

        return "member-${payload.id}"
    }

    private fun shouldPreferApiKeyAuthorityOnWrite(
        request: HttpServletRequest,
        apiKey: String,
    ): Boolean {
        if (apiKey.isBlank()) return false
        val method =
            request.method
                ?.trim()
                ?.uppercase(Locale.ROOT)
                .orEmpty()
        return method in MUTATING_METHODS
    }
}
