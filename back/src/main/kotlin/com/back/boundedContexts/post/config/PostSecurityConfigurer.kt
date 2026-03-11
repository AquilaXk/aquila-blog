package com.back.boundedContexts.post.config

import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class PostSecurityConfigurer {
    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        authorize.apply {
            authorize(HttpMethod.GET, "/post/api/*/posts", permitAll)
            authorize(HttpMethod.GET, "/post/api/*/posts/{id:\\d+}", permitAll)
            authorize(HttpMethod.GET, "/post/api/*/images/**", permitAll)
            authorize(HttpMethod.POST, "/post/api/*/posts/{id:\\d+}/hit", permitAll)
            authorize(HttpMethod.GET, "/post/api/*/posts/{postId:\\d+}/comments", permitAll)
            authorize(HttpMethod.GET, "/post/api/*/posts/{postId:\\d+}/comments/{id:\\d+}", permitAll)
            authorize(HttpMethod.POST, "/post/api/*/posts", hasRole("ADMIN"))
            authorize(HttpMethod.POST, "/post/api/*/posts/images", hasRole("ADMIN"))
            authorize(HttpMethod.PUT, "/post/api/*/posts/{id:\\d+}", hasRole("ADMIN"))
            authorize(HttpMethod.DELETE, "/post/api/*/posts/{id:\\d+}", hasRole("ADMIN"))
            authorize(HttpMethod.GET, "/post/api/*/posts/mine", hasRole("ADMIN"))
            authorize(HttpMethod.POST, "/post/api/*/posts/temp", hasRole("ADMIN"))
        }
    }
}
