package com.back.global.security.config

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.dto.shared.AccessTokenPayload
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.Rq
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

@Component
class LegacyPayloadRecoveryHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val securityContextAuthenticationWriter: SecurityContextAuthenticationWriter,
    private val rq: Rq,
) {
    fun recoverIfNeeded(
        payload: AccessTokenPayload,
        sessionContext: AuthenticationSessionContext,
    ): Boolean {
        if (!payload.email.isNullOrBlank()) return false

        val persistedMember = actorApplicationService.findById(payload.id) ?: return false
        val rotatedAccessToken =
            actorApplicationService.genAccessToken(
                member = persistedMember,
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
        securityContextAuthenticationWriter.write(persistedMember)
        return true
    }
}
