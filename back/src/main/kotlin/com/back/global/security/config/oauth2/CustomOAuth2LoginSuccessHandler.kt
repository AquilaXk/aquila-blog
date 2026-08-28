package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.service.MemberLoginSessionIssueService
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.security.config.oauth2.application.OAuth2State
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
import com.back.global.web.application.ClientIpResolver
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component

@Component
class CustomOAuth2LoginSuccessHandler(
    private val memberLoginSessionIssueService: MemberLoginSessionIssueService,
    private val authCookieService: AuthCookieService,
    private val clientIpResolver: ClientIpResolver,
) : AuthenticationSuccessHandler {
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val stateParam =
            request.getParameter("state")
                ?: throw AppException(ErrorCode.BAD_REQUEST, "state 파라미터가 없습니다.")
        val state = OAuth2State.decode(stateParam)
        val securityUser = authentication.principal as SecurityUser
        val issued =
            memberLoginSessionIssueService.issue(
                memberId = securityUser.id,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = clientIpResolver.resolve(request),
                userAgent = request.getHeader("User-Agent"),
            )

        authCookieService.issueAuthCookies(
            apiKey = issued.apiKey,
            accessToken = issued.accessToken,
            refreshToken = issued.refreshToken,
            sessionKey = issued.sessionKey,
            rememberLoginEnabled = issued.rememberLoginEnabled,
        )
        response.sendRedirect(state.redirectUrl)
    }
}
