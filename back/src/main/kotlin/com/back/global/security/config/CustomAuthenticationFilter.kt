package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionService
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.security.application.AuthIpSecurityService
import com.back.global.security.application.AuthSecurityEventService
import com.back.global.security.domain.SecurityUser
import com.back.global.security.domain.toGrantedAuthorities
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import com.back.global.web.application.Rq
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.Authentication
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.ObjectMapper
import java.util.Locale

/**
 * CustomAuthenticationFilter는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
@Component
class CustomAuthenticationFilter(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionService: MemberSessionService,
    private val authIpSecurityService: AuthIpSecurityService,
    private val authSecurityEventService: AuthSecurityEventService,
    private val authCookieService: AuthCookieService,
    private val clientIpResolver: ClientIpResolver,
    private val objectMapper: ObjectMapper,
    private val publicApiRequestMatcher: PublicApiRequestMatcher,
    private val apiCorsPolicy: ApiCorsPolicy,
    private val rq: Rq,
) : OncePerRequestFilter() {
    private val log = org.slf4j.LoggerFactory.getLogger(CustomAuthenticationFilter::class.java)
    private val filteredPrefixes = listOf("/member/api/", "/post/api/", "/system/api/", "/ws/", "/sse/")

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val uri = request.requestURI
        return filteredPrefixes.none { uri.startsWith(it) }
    }

    override fun shouldNotFilterAsyncDispatch(): Boolean = false

    /**
     * doFilterInternal 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
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
     * authenticateIfPossible 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    private fun authenticateIfPossible(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val tokens = extractTokens()
        val apiKey = tokens.apiKey
        val accessToken = tokens.accessToken
        val sessionKey = tokens.sessionKey
        val clientIp = clientIpResolver.resolve(request)

        if (apiKey.isBlank() && accessToken.isBlank()) return

        val payload = accessToken.takeIf { it.isNotBlank() }?.let(actorApplicationService::payload)

        if (payload != null) {
            // 쓰기 요청은 apiKey 기준 DB 회원을 우선 사용해 role 드리프트(특히 관리자 403 오탐)를 방지한다.
            if (shouldPreferApiKeyAuthorityOnWrite(request, apiKey)) {
                val apiKeyMember = actorApplicationService.findByApiKey(apiKey)
                if (apiKeyMember != null) {
                    val sessionResolution = resolveMemberSession(apiKeyMember.id, sessionKey, payload.sessionKey)
                    ensureSessionIsUsable(sessionResolution)
                    val memberSession = sessionResolution.session
                    val rememberLoginEnabled = memberSession?.rememberLoginEnabled ?: apiKeyMember.rememberLoginEnabled
                    val ipSecurityEnabled = memberSession?.ipSecurityEnabled ?: apiKeyMember.ipSecurityEnabled
                    val ipSecurityFingerprint = memberSession?.ipSecurityFingerprint ?: apiKeyMember.ipSecurityFingerprint

                    if (ipSecurityEnabled) {
                        val matched = authIpSecurityService.matches(ipSecurityFingerprint, clientIp)
                        if (!matched) {
                            runCatching {
                                authSecurityEventService.recordIpSecurityMismatchBlocked(
                                    memberId = apiKeyMember.id,
                                    loginIdentifier = apiKeyMember.username,
                                    rememberLoginEnabled = rememberLoginEnabled,
                                    ipSecurityEnabled = ipSecurityEnabled,
                                    expectedIpFingerprint = ipSecurityFingerprint,
                                    requestPath = request.requestURI,
                                    reason = "apikey-ip-mismatch",
                                )
                            }.onFailure { exception ->
                                log.warn("auth_security_event_record_failed reason=apikey-ip-mismatch", exception)
                            }
                            authCookieService.expireAuthCookies()
                            throw AppException("401-7", "IP 보안 검증에 실패했습니다. 다시 로그인해주세요.")
                        }
                    }

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
                    memberSession?.let(memberSessionService::touchAuthenticated)
                    authenticate(apiKeyMember)
                    return
                }
            }

            val sessionResolution = resolveMemberSession(payload.id, sessionKey, payload.sessionKey)
            ensureSessionIsUsable(sessionResolution)
            val memberSession = sessionResolution.session
            val rememberLoginEnabled = memberSession?.rememberLoginEnabled ?: payload.rememberLoginEnabled
            val ipSecurityEnabled = memberSession?.ipSecurityEnabled ?: payload.ipSecurityEnabled
            val ipSecurityFingerprint = memberSession?.ipSecurityFingerprint ?: payload.ipSecurityFingerprint
            val tokenLoginIdentifier = resolveTokenLoginIdentifier(payload)
            if (ipSecurityEnabled) {
                val matched = authIpSecurityService.matches(ipSecurityFingerprint, clientIp)
                if (!matched) {
                    runCatching {
                        authSecurityEventService.recordIpSecurityMismatchBlocked(
                            memberId = payload.id,
                            loginIdentifier = tokenLoginIdentifier,
                            rememberLoginEnabled = rememberLoginEnabled,
                            ipSecurityEnabled = ipSecurityEnabled,
                            expectedIpFingerprint = ipSecurityFingerprint,
                            requestPath = request.requestURI,
                            reason = "token-payload-ip-mismatch",
                        )
                    }.onFailure { exception ->
                        log.warn("auth_security_event_record_failed reason=token-payload-ip-mismatch", exception)
                    }
                    authCookieService.expireAuthCookies()
                    throw AppException("401-7", "IP 보안 검증에 실패했습니다. 다시 로그인해주세요.")
                }
            }

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
                    memberSession?.let(memberSessionService::touchAuthenticated)
                    authenticate(persistedMember)
                    return
                }
            }

            memberSession?.let(memberSessionService::touchAuthenticated)
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

        val member =
            actorApplicationService.findByApiKey(apiKey)
                ?: throw AppException("401-3", "API 키가 유효하지 않습니다.")

        val sessionResolution = resolveMemberSession(member.id, sessionKey, null)
        ensureSessionIsUsable(sessionResolution)
        val memberSession = sessionResolution.session
        val rememberLoginEnabled = memberSession?.rememberLoginEnabled ?: member.rememberLoginEnabled
        val ipSecurityEnabled = memberSession?.ipSecurityEnabled ?: member.ipSecurityEnabled
        val ipSecurityFingerprint = memberSession?.ipSecurityFingerprint ?: member.ipSecurityFingerprint

        if (ipSecurityEnabled) {
            val matched = authIpSecurityService.matches(ipSecurityFingerprint, clientIp)
            if (!matched) {
                runCatching {
                    authSecurityEventService.recordIpSecurityMismatchBlocked(
                        memberId = member.id,
                        loginIdentifier = member.username,
                        rememberLoginEnabled = rememberLoginEnabled,
                        ipSecurityEnabled = ipSecurityEnabled,
                        expectedIpFingerprint = ipSecurityFingerprint,
                        requestPath = request.requestURI,
                        reason = "apikey-ip-mismatch",
                    )
                }.onFailure { exception ->
                    log.warn("auth_security_event_record_failed reason=apikey-ip-mismatch", exception)
                }
                authCookieService.expireAuthCookies()
                throw AppException("401-7", "IP 보안 검증에 실패했습니다. 다시 로그인해주세요.")
            }
        }

        val newAccessToken =
            actorApplicationService.genAccessToken(
                member = member,
                sessionKey = memberSession?.sessionKey,
                rememberLoginEnabled = rememberLoginEnabled,
                ipSecurityEnabled = ipSecurityEnabled,
                ipSecurityFingerprint = ipSecurityFingerprint,
            )
        authCookieService.issueAccessToken(
            accessToken = newAccessToken,
            rememberLoginEnabled = rememberLoginEnabled,
            sessionKey = memberSession?.sessionKey,
        )
        rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $newAccessToken")
        memberSession?.let(memberSessionService::touchAuthenticated)

        authenticate(member)
    }

    /**
     * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    private fun extractTokens(): ExtractedTokens {
        val headerAuthorization = rq.getHeader(HttpHeaders.AUTHORIZATION, "")
        val sessionKey = rq.getCookieValue("sessionKey", "")

        return if (headerAuthorization.isNotBlank()) {
            if (!headerAuthorization.startsWith("Bearer ")) {
                throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
            }

            val bits = headerAuthorization.trim().split(Regex("\\s+"))
            when (bits.size) {
                2 -> {
                    if (bits[1].isBlank()) throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
                    ExtractedTokens("", bits[1], sessionKey)
                }
                3 -> {
                    if (bits[1].isBlank() || bits[2].isBlank()) {
                        throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
                    }
                    ExtractedTokens(bits[1], bits[2], sessionKey)
                }
                else -> throw AppException("401-2", "${HttpHeaders.AUTHORIZATION} 헤더가 Bearer 형식이 아닙니다.")
            }
        } else {
            ExtractedTokens(
                apiKey = rq.getCookieValue("apiKey", ""),
                accessToken = rq.getCookieValue("accessToken", ""),
                sessionKey = sessionKey,
            )
        }
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
    }

    private data class ExtractedTokens(
        val apiKey: String,
        val accessToken: String,
        val sessionKey: String,
    )

    private data class SessionResolution(
        val sessionKeyProvided: Boolean,
        val session: MemberSession?,
    )

    private fun resolveMemberSession(
        memberId: Long,
        cookieSessionKey: String,
        tokenSessionKey: String?,
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

        return SessionResolution(
            sessionKeyProvided = true,
            session = memberSessionService.findActiveSession(memberId, effectiveSessionKey),
        )
    }

    private fun ensureSessionIsUsable(sessionResolution: SessionResolution) {
        if (sessionResolution.sessionKeyProvided && sessionResolution.session == null) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }
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
