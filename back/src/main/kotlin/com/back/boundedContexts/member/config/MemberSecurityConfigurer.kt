package com.back.boundedContexts.member.config

import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.PublicApiRouteSpec
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class MemberSecurityConfigurer(
    @param:Value("\${custom.member.signup.legacyDirectJoinEnabled:false}")
    private val legacyDirectJoinEnabled: Boolean,
) : PublicApiRouteContributor {
    override fun publicApiRoutes() =
        buildList {
            if (legacyDirectJoinEnabled) {
                add(PublicApiRouteSpec("/member/api/*/members", HttpMethod.POST))
            }
            add(PublicApiRouteSpec("/member/api/*/members/randomSecureTip", HttpMethod.GET))
            add(PublicApiRouteSpec("/member/api/*/members/adminProfile", HttpMethod.GET))
            add(PublicApiRouteSpec("/member/api/*/members/{id:\\d+}/redirectToProfileImg", HttpMethod.GET))
            add(PublicApiRouteSpec("/member/api/*/signup/email/start", HttpMethod.POST))
            add(PublicApiRouteSpec("/member/api/*/signup/email/verify", HttpMethod.GET))
            add(PublicApiRouteSpec("/member/api/*/signup/complete", HttpMethod.POST))
        }

    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        publicApiRoutes().forEach { it.authorizePermitAll(authorize) }
    }
}
