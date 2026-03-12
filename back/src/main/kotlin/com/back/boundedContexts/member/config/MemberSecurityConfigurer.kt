package com.back.boundedContexts.member.config

import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.PublicApiRouteSpec
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class MemberSecurityConfigurer : PublicApiRouteContributor {
    override fun publicApiRoutes() =
        listOf(
            PublicApiRouteSpec("/member/api/*/members", HttpMethod.POST),
            PublicApiRouteSpec("/member/api/*/members/randomSecureTip", HttpMethod.GET),
            PublicApiRouteSpec("/member/api/*/members/adminProfile", HttpMethod.GET),
            PublicApiRouteSpec("/member/api/*/members/{id:\\d+}/redirectToProfileImg", HttpMethod.GET),
            PublicApiRouteSpec("/member/api/*/signup/email/start", HttpMethod.POST),
            PublicApiRouteSpec("/member/api/*/signup/email/verify", HttpMethod.GET),
            PublicApiRouteSpec("/member/api/*/signup/complete", HttpMethod.POST),
        )

    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        publicApiRoutes().forEach { it.authorizePermitAll(authorize) }
    }
}
