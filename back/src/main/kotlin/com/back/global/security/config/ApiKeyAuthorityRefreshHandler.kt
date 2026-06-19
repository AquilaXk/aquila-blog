package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

@Component
class ApiKeyAuthorityRefreshHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val authIpSecurityVerifier: AuthIpSecurityVerifier,
    private val securityContextAuthenticationWriter: SecurityContextAuthenticationWriter,
    private val memberSessionAuthenticationResolver: MemberSessionAuthenticationResolver,
    private val rq: Rq,
) {
    fun authenticateIfPreferred(
        request: HttpServletRequest,
        apiKey: String,
        payload: AccessTokenPayload,
        sessionKey: String,
        clientIp: String,
    ): Boolean {
        if (!AuthRequestMethodPolicy.isMutating(request) || apiKey.isBlank()) return false

        val apiKeyMember = actorApplicationService.findByApiKey(apiKey) ?: return false
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

        val rotatedAccessToken =
            actorApplicationService.genAccessToken(
                member = apiKeyMember,
                sessionKey = sessionContext.session?.sessionKey,
                rememberLoginEnabled = sessionContext.rememberLoginEnabled,
                ipSecurityEnabled = sessionContext.ipSecurityEnabled,
                ipSecurityFingerprint = sessionContext.ipSecurityFingerprint,
            )
        authCookieService.issueAccessToken(
            accessToken = rotatedAccessToken,
            rememberLoginEnabled = sessionContext.rememberLoginEnabled,
            sessionKey = sessionContext.session?.sessionKey,
        )
        rq.setHeader(HttpHeaders.AUTHORIZATION, "Bearer $rotatedAccessToken")
        sessionContext.session?.let { memberSessionUseCase.touchAuthenticated(it) }
        securityContextAuthenticationWriter.write(apiKeyMember)
        return true
    }
}
