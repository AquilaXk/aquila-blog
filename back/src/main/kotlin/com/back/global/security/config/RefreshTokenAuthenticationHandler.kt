package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.application.service.CanonicalAdminPolicy
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

@Component
class RefreshTokenAuthenticationHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val authIpSecurityVerifier: AuthIpSecurityVerifier,
    private val securityContextAuthenticationWriter: SecurityContextAuthenticationWriter,
    private val memberSessionAuthenticationResolver: MemberSessionAuthenticationResolver,
    private val rq: Rq,
    private val canonicalAdminPolicy: CanonicalAdminPolicy,
) {
    fun authenticate(
        request: HttpServletRequest,
        tokens: ExtractedAuthTokens,
        clientIp: String,
    ) {
        if (tokens.sessionKey.isBlank() || tokens.refreshToken.isBlank()) {
            memberSessionAuthenticationResolver.rejectExpiredSession()
        }

        val refreshedSession =
            memberSessionUseCase.rotateRefreshToken(tokens.sessionKey, tokens.refreshToken)
                ?: memberSessionAuthenticationResolver.rejectExpiredSession()

        val memberSession = refreshedSession.session
        val member =
            actorApplicationService
                .findById(memberSession.member.id)
                ?.takeIf(canonicalAdminPolicy::canAuthenticate)
                ?: memberSessionAuthenticationResolver.rejectExpiredSession()
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

        securityContextAuthenticationWriter.write(member, memberSession.id)
    }
}
