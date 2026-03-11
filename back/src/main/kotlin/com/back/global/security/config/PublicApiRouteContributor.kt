package com.back.global.security.config

interface PublicApiRouteContributor {
    fun publicApiRoutes(): List<PublicApiRouteSpec>
}
