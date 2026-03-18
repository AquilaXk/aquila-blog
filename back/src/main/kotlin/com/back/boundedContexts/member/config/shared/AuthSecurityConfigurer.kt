package com.back.boundedContexts.member.config.shared

import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.PublicApiRouteSpec
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

/**
 * AuthSecurityConfigurer는 해당 도메인의 설정 구성을 담당합니다.
 * 보안 정책, 빈 등록, 프로퍼티 매핑 등 실행 구성을 명시합니다.
 */
@Component
class AuthSecurityConfigurer : PublicApiRouteContributor {
    override fun publicApiRoutes() =
        listOf(
            PublicApiRouteSpec("/member/api/*/auth/login"),
            PublicApiRouteSpec("/member/api/*/auth/logout"),
        )

    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        publicApiRoutes().forEach { it.authorizePermitAll(authorize) }
    }
}
