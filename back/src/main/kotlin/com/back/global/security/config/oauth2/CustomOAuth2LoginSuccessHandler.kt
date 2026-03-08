package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.app.shared.ActorFacade
import com.back.global.exception.app.AppException
import com.back.global.security.config.oauth2.app.OAuth2State
import com.back.global.security.domain.SecurityUser
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class CustomOAuth2LoginSuccessHandler(
    private val actorFacade: ActorFacade,
) : AuthenticationSuccessHandler {

    @Transactional(readOnly = true)
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val securityUser = authentication.principal as SecurityUser
        val actor = actorFacade.memberOf(securityUser)

        val accessToken = actorFacade.genAccessToken(actor)

        response.addAuthCookie("apiKey", actor.apiKey)
        response.addAuthCookie("accessToken", accessToken)

        val stateParam = request.getParameter("state")
            ?: throw AppException("400-1", "state 파라미터가 없습니다.")
        val state = OAuth2State.decode(stateParam)
        response.sendRedirect(state.redirectUrl)
    }

    private fun HttpServletResponse.addAuthCookie(name: String, value: String) {
        addCookie(Cookie(name, value).apply {
            path = "/"
            isHttpOnly = true
        })
    }
}
