package com.back.boundedContexts.member.config.shared

import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class AuthSecurityConfigurer {
    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        authorize.apply {
            authorize("/member/api/*/auth/login", permitAll)
            authorize("/member/api/*/auth/logout", permitAll)
        }
    }
}
