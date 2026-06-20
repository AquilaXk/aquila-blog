package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import com.back.global.security.config.oauth2.application.OAuth2State
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CustomOAuth2LoginSuccessHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val authCookieService: AuthCookieService,
    private val clientIpResolver: ClientIpResolver,
) : AuthenticationSuccessHandler {
    @Transactional
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val securityUser = authentication.principal as SecurityUser
        val actor = actorApplicationService.memberOf(securityUser)

        // 다중 세션 유지를 위해 OAuth 로그인도 apiKey를 매번 회전하지 않는다.
        // 단, 레거시/비정상 키는 1회 보정한다.
        if (actor.apiKey.isBlank() || actor.apiKey == actor.username) {
            actor.modifyApiKey(MemberPolicy.genApiKey())
        }
        val createdSession =
            memberSessionUseCase.createSessionWithRefreshToken(
                member = actor,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = clientIpResolver.resolve(request),
                userAgent = request.getHeader("User-Agent"),
            )
        val session = createdSession.session
        val accessToken =
            actorApplicationService.genAccessToken(
                member = actor,
                sessionKey = session.sessionKey,
                rememberLoginEnabled = session.rememberLoginEnabled,
                ipSecurityEnabled = session.ipSecurityEnabled,
                ipSecurityFingerprint = session.ipSecurityFingerprint,
            )

        authCookieService.issueAuthCookies(
            apiKey = actor.apiKey,
            accessToken = accessToken,
            refreshToken = createdSession.refreshToken,
            sessionKey = session.sessionKey,
            rememberLoginEnabled = session.rememberLoginEnabled,
        )

        val stateParam =
            request.getParameter("state")
                ?: throw AppException("400-1", "state 파라미터가 없습니다.")
        val state = OAuth2State.decode(stateParam)
        response.sendRedirect(state.redirectUrl)
    }
}
