package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.global.exception.application.AppException
import com.back.global.security.config.oauth2.application.OAuth2State
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CustomOAuth2LoginSuccessHandler(
    private val actorApplicationService: ActorApplicationService,
    private val authCookieService: AuthCookieService,
) : AuthenticationSuccessHandler {
    @Transactional
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val securityUser = authentication.principal as SecurityUser
        val actor = actorApplicationService.memberOf(securityUser)

        // OAuth 로그인도 비밀번호 로그인과 동일하게 장기 인증 식별자(apiKey)를 회전한다.
        actor.modifyApiKey(MemberPolicy.genApiKey())
        val accessToken = actorApplicationService.genAccessToken(actor)

        authCookieService.issueAuthCookies(actor.apiKey, accessToken)

        val stateParam =
            request.getParameter("state")
                ?: throw AppException("400-1", "state 파라미터가 없습니다.")
        val state = OAuth2State.decode(stateParam)
        response.sendRedirect(state.redirectUrl)
    }
}
