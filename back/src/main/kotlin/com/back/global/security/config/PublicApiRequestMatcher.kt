package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import org.springframework.stereotype.Component

@Component
class PublicApiRequestMatcher(
    contributors: List<PublicApiRouteContributor>,
) {
    private val routes =
        contributors
            .flatMap(PublicApiRouteContributor::publicApiRoutes)

    fun matches(request: HttpServletRequest): Boolean = routes.any { it.matches(request) }
}
