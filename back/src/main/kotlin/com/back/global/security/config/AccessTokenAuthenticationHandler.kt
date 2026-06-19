package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component

@Component
class AccessTokenAuthenticationHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authIpSecurityVerifier: AuthIpSecurityVerifier,
    private val securityContextAuthenticationWriter: SecurityContextAuthenticationWriter,
    private val memberSessionAuthenticationResolver: MemberSessionAuthenticationResolver,
    private val apiKeyAuthorityRefreshHandler: ApiKeyAuthorityRefreshHandler,
    private val legacyPayloadRecoveryHandler: LegacyPayloadRecoveryHandler,
) {
    fun authenticate(
        request: HttpServletRequest,
        tokens: ExtractedAuthTokens,
        clientIp: String,
    ): Boolean {
        val payload = tokens.accessToken.takeIf { it.isNotBlank() }?.let(actorApplicationService::payload) ?: return false

        if (
            apiKeyAuthorityRefreshHandler.authenticateIfPreferred(
                request = request,
                apiKey = tokens.apiKey,
                payload = payload,
                sessionKey = tokens.sessionKey,
                clientIp = clientIp,
            )
        ) {
            return true
        }

        val sessionResolution =
            memberSessionAuthenticationResolver.resolve(
                memberId = payload.id,
                cookieSessionKey = tokens.sessionKey,
                tokenSessionKey = payload.sessionKey,
                payload = payload,
                request = request,
            )
        memberSessionAuthenticationResolver.ensureUsable(sessionResolution, requireSession = true)
        val sessionContext =
            memberSessionAuthenticationResolver.context(
                sessionResolution = sessionResolution,
                fallbackRememberLoginEnabled = payload.rememberLoginEnabled,
                fallbackIpSecurityEnabled = payload.ipSecurityEnabled,
                fallbackIpSecurityFingerprint = payload.ipSecurityFingerprint,
            )

        authIpSecurityVerifier.verify(
            AuthIpSecurityCheck(
                memberId = payload.id,
                loginIdentifier = resolveTokenLoginIdentifier(payload),
                rememberLoginEnabled = sessionContext.rememberLoginEnabled,
                ipSecurityEnabled = sessionContext.ipSecurityEnabled,
                expectedIpFingerprint = sessionContext.ipSecurityFingerprint,
                requestPath = request.requestURI,
                reason = "token-payload-ip-mismatch",
            ),
            clientIp,
        )

        if (legacyPayloadRecoveryHandler.recoverIfNeeded(payload, sessionContext)) return true

        sessionContext.session?.let { memberSessionUseCase.touchAuthenticated(it) }
        val payloadMember = actorApplicationService.findById(payload.id) ?: payload.toTransientMember()
        securityContextAuthenticationWriter.write(payloadMember)
        return true
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

    private fun AccessTokenPayload.toTransientMember(): Member =
        Member(
            id = id,
            username = resolvePrincipalUsername(this),
            password = null,
            nickname = name,
            email = email,
        )
}
