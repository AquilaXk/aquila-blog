package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.application.service.CanonicalAdminPolicy
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import java.time.Instant

@Component
class ApiKeyAuthorityRefreshHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val authIpSecurityVerifier: AuthIpSecurityVerifier,
    private val securityContextAuthenticationWriter: SecurityContextAuthenticationWriter,
    private val memberSessionAuthenticationResolver: MemberSessionAuthenticationResolver,
    private val rq: Rq,
    private val canonicalAdminPolicy: CanonicalAdminPolicy,
) {
    fun authenticateIfPreferred(
        request: HttpServletRequest,
        apiKey: String,
        payload: AccessTokenPayload,
        sessionKey: String,
        clientIp: String,
    ): Boolean {
        if (!AuthRequestMethodPolicy.isMutating(request) || apiKey.isBlank()) return false
        if (hasFreshCanonicalTokenClaims(payload, sessionKey)) return false

        val apiKeyMember = actorApplicationService.findByApiKey(apiKey) ?: return false
        if (!canonicalAdminPolicy.canAuthenticate(apiKeyMember)) {
            throw memberSessionAuthenticationResolver.expiredSessionException()
        }
        val sessionResolution =
            memberSessionAuthenticationResolver.resolve(
                memberId = apiKeyMember.id,
                cookieSessionKey = sessionKey,
                tokenSessionKey = payload.sessionKey,
                payload = payload,
                request = request,
            )
        memberSessionAuthenticationResolver.ensureUsable(sessionResolution, requireSession = true)
        val sessionContext =
            memberSessionAuthenticationResolver.context(
                sessionResolution = sessionResolution,
                fallbackRememberLoginEnabled = apiKeyMember.rememberLoginEnabled,
                fallbackIpSecurityEnabled = apiKeyMember.ipSecurityEnabled,
                fallbackIpSecurityFingerprint = apiKeyMember.ipSecurityFingerprint,
            )

        authIpSecurityVerifier.verify(
            AuthIpSecurityCheck(
                memberId = apiKeyMember.id,
                loginIdentifier = apiKeyMember.username,
                rememberLoginEnabled = sessionContext.rememberLoginEnabled,
                ipSecurityEnabled = sessionContext.ipSecurityEnabled,
                expectedIpFingerprint = sessionContext.ipSecurityFingerprint,
                requestPath = request.requestURI,
                reason = "apikey-ip-mismatch",
            ),
            clientIp,
        )

        val resolvedSessionKey = sessionContext.session?.sessionKey
        val shouldReissueToken =
            payload.tokenVersion != AccessTokenPayload.CURRENT_TOKEN_VERSION ||
                payload.id != apiKeyMember.id ||
                payload.sessionKey != resolvedSessionKey ||
                payload.email != apiKeyMember.email ||
                payload.name != apiKeyMember.name ||
                payload.rememberLoginEnabled != sessionContext.rememberLoginEnabled ||
                payload.ipSecurityEnabled != sessionContext.ipSecurityEnabled ||
                payload.ipSecurityFingerprint != sessionContext.ipSecurityFingerprint
        if (shouldReissueToken) {
            val rotatedAccessToken =
                actorApplicationService.genAccessToken(
                    member = apiKeyMember,
                    sessionKey = resolvedSessionKey,
                    rememberLoginEnabled = sessionContext.rememberLoginEnabled,
                    ipSecurityEnabled = sessionContext.ipSecurityEnabled,
                    ipSecurityFingerprint = sessionContext.ipSecurityFingerprint,
                )
            authCookieService.issueAccessToken(
                accessToken = rotatedAccessToken,
                rememberLoginEnabled = sessionContext.rememberLoginEnabled,
                sessionKey = resolvedSessionKey,
            )
            rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $rotatedAccessToken")
        }
        sessionContext.session?.let { memberSessionUseCase.touchAuthenticated(it) }
        securityContextAuthenticationWriter.write(apiKeyMember, sessionContext.session?.id)
        return true
    }

    private fun hasFreshCanonicalTokenClaims(
        payload: AccessTokenPayload,
        cookieSessionKey: String,
    ): Boolean {
        if (payload.tokenVersion != AccessTokenPayload.CURRENT_TOKEN_VERSION) return false
        val tokenSessionKey = payload.sessionKey?.trim().orEmpty()
        if (tokenSessionKey.isBlank()) return false
        val trimmedCookieSessionKey = cookieSessionKey.trim()
        if (trimmedCookieSessionKey.isNotBlank() && tokenSessionKey != trimmedCookieSessionKey) return false
        if (!canonicalAdminPolicy.matchesEmail(payload.email)) return false
        val expiresAt = payload.expiresAt
        return expiresAt == null || expiresAt.isAfter(Instant.now())
    }
}
