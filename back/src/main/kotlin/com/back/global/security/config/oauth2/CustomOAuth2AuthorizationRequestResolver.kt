package com.back.global.security.config.oauth2

import com.back.global.security.config.oauth2.application.OAuth2State
import jakarta.servlet.http.HttpServletRequest
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest
import org.springframework.stereotype.Component

/**
 * CustomOAuth2AuthorizationRequestResolver는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Component
class CustomOAuth2AuthorizationRequestResolver(
    private val clientRegistrationRepository: ClientRegistrationRepository,
) : OAuth2AuthorizationRequestResolver {
    private val delegate =
        DefaultOAuth2AuthorizationRequestResolver(
            clientRegistrationRepository,
            OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI,
        )

    override fun resolve(request: HttpServletRequest): OAuth2AuthorizationRequest? =
        delegate.resolve(request)?.let { customizeState(it, request) }

    override fun resolve(
        request: HttpServletRequest,
        clientRegistrationId: String?,
    ): OAuth2AuthorizationRequest? = delegate.resolve(request, clientRegistrationId)?.let { customizeState(it, request) }

    private fun customizeState(
        req: OAuth2AuthorizationRequest,
        request: HttpServletRequest,
    ): OAuth2AuthorizationRequest {
        val state = OAuth2State.of(request.getParameter("redirectUrl") ?: "")

        return OAuth2AuthorizationRequest
            .from(req)
            .state(state.encode())
            .build()
    }
}
