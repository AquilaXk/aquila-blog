package com.back.global.security.config.oauth2

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionService
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

/**
 * CustomOAuth2LoginSuccessHandler는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Component
class CustomOAuth2LoginSuccessHandler(
    private val actorApplicationService: ActorApplicationService,
    private val memberSessionService: MemberSessionService,
    private val authCookieService: AuthCookieService,
    private val clientIpResolver: ClientIpResolver,
) : AuthenticationSuccessHandler {
    /**
     * onAuthenticationSuccess 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
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
        val session =
            memberSessionService.createSession(
                member = actor,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = clientIpResolver.resolve(request),
                userAgent = request.getHeader("User-Agent"),
            )
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
