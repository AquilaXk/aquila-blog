package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component

/**
 * PublicApiRequestMatcher는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
@Component
class PublicApiRequestMatcher(
    contributors: List<PublicApiRouteContributor>,
) {
    private val routes =
        contributors
            .flatMap(PublicApiRouteContributor::publicApiRoutes)

    fun matches(request: HttpServletRequest): Boolean = routes.any { it.matches(request) }
}
