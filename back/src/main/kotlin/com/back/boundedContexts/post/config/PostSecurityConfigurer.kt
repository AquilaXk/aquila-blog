package com.back.boundedContexts.post.config

import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.PublicApiRouteSpec
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class PostSecurityConfigurer : PublicApiRouteContributor {
    override fun publicApiRoutes() =
        listOf(
            PublicApiRouteSpec("/post/api/*/posts", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/{id:\\d+}", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/images/**", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/{id:\\d+}/hit", HttpMethod.POST),
            PublicApiRouteSpec("/post/api/*/posts/{postId:\\d+}/comments", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/{postId:\\d+}/comments/{id:\\d+}", HttpMethod.GET),
        )

    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        publicApiRoutes().forEach { it.authorizePermitAll(authorize) }

        authorize.apply {
            authorize(HttpMethod.POST, "/post/api/*/posts", hasRole("ADMIN"))
            authorize(HttpMethod.POST, "/post/api/*/posts/images", hasRole("ADMIN"))
            authorize(HttpMethod.PUT, "/post/api/*/posts/{id:\\d+}", hasRole("ADMIN"))
            authorize(HttpMethod.DELETE, "/post/api/*/posts/{id:\\d+}", hasRole("ADMIN"))
            authorize(HttpMethod.GET, "/post/api/*/posts/mine", hasRole("ADMIN"))
            authorize(HttpMethod.POST, "/post/api/*/posts/temp", hasRole("ADMIN"))
        }
    }
}
