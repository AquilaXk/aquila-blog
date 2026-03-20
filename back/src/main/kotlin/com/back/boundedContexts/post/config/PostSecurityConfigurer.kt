package com.back.boundedContexts.post.config

import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.PublicApiRouteSpec
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

/**
 * PostSecurityConfigurer는 해당 도메인의 설정 구성을 담당합니다.
 * 보안 정책, 빈 등록, 프로퍼티 매핑 등 실행 구성을 명시합니다.
 */
@Component
class PostSecurityConfigurer : PublicApiRouteContributor {
    override fun publicApiRoutes() =
        listOf(
            PublicApiRouteSpec("/post/api/*/posts", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/feed", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/feed/cursor", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/explore", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/explore/cursor", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/search", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/tags", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/{id:\\d+}", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/images/**", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/{id:\\d+}/hit", HttpMethod.POST),
            PublicApiRouteSpec("/post/api/*/posts/{postId:\\d+}/comments", HttpMethod.GET),
            PublicApiRouteSpec("/post/api/*/posts/{postId:\\d+}/comments/{id:\\d+}", HttpMethod.GET),
        )

    /**
     * configure 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 설정 계층에서 런타임 규칙이 실제 요청 체인에 반영되도록 구성합니다.
     */
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
