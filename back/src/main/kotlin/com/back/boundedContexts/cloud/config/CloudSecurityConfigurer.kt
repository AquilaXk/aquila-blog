package com.back.boundedContexts.cloud.config

import com.back.global.security.config.PublicApiRouteContributor
import com.back.global.security.config.PublicApiRouteSpec
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.stereotype.Component

@Component
class CloudSecurityConfigurer : PublicApiRouteContributor {
    override fun publicApiRoutes() =
        listOf(
            PublicApiRouteSpec("/system/api/v1/public/cloud/files/*/playback", HttpMethod.GET),
            PublicApiRouteSpec("/system/api/v1/public/cloud/files/*/playback", HttpMethod.HEAD),
        )

    fun configure(authorize: AuthorizeHttpRequestsDsl) {
        publicApiRoutes().forEach { it.authorizePermitAll(authorize) }
    }
}
