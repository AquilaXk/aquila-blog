package com.back.boundedContexts.member.config

import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class MemberSecurityConfigurer {
    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        authorize.apply {
            authorize(HttpMethod.POST, "/member/api/*/members", permitAll)
            authorize(HttpMethod.GET, "/member/api/*/members/adminProfile", permitAll)
            authorize(HttpMethod.GET, "/member/api/*/members/{id:\\d+}/redirectToProfileImg", permitAll)
        }
    }
}
