package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders

internal class RefreshTokenAuthenticationHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val authIpSecurityVerifier: AuthIpSecurityVerifier,
    private val securityContextAuthenticationWriter: SecurityContextAuthenticationWriter,
    private val rq: Rq,
) {
    fun authenticate(
        request: HttpServletRequest,
        tokens: ExtractedAuthTokens,
        clientIp: String,
    ) {
        if (tokens.sessionKey.isBlank() || tokens.refreshToken.isBlank()) {
            authCookieService.expireAuthCookies()
            throw AppException("401-8", "세션이 만료되었습니다. 다시 로그인해주세요.")
        }

        val refreshedSession =
            memberSessionUseCase.rotateRefreshToken(tokens.sessionKey, tokens.refreshToken)
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

        securityContextAuthenticationWriter.write(member)
    }
}
