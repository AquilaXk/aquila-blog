package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpMethod
import org.springframework.http.server.PathContainer
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.web.util.pattern.PathPatternParser

data class PublicApiRouteSpec(
    val pattern: String,
    val method: HttpMethod? = null,
) {
    private val pathPattern = PathPatternParser.defaultInstance.parse(pattern)

    fun authorizePermitAll(authorize: AuthorizeHttpRequestsDsl) {
        if (method == null) {
            authorize.authorize(pattern, authorize.permitAll)
            return
        }

        authorize.authorize(method, pattern, authorize.permitAll)
    }

    fun matches(request: HttpServletRequest): Boolean {
        if (method != null && request.method != method.name()) return false

        return pathPattern.matches(PathContainer.parsePath(request.requestURI))
    }
}
