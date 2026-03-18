package com.back.global.security.config

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpMethod
import org.springframework.http.server.PathContainer
import org.springframework.security.config.annotation.web.AuthorizeHttpRequestsDsl
import org.springframework.web.util.pattern.PathPatternParser

/**
 * PublicApiRouteSpec는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */
data class PublicApiRouteSpec(
    val pattern: String,
    val method: HttpMethod? = null,
) {
    private val pathPattern = PathPatternParser.defaultInstance.parse(pattern)

    /**
     * authorizePermitAll 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    fun authorizePermitAll(authorize: AuthorizeHttpRequestsDsl) {
        if (method == null) {
            authorize.authorize(pattern, authorize.permitAll)
            return
        }

        authorize.authorize(method, pattern, authorize.permitAll)
    }

    /**
     * matches 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    fun matches(request: HttpServletRequest): Boolean {
        if (method != null && request.method != method.name()) return false

        return pathPattern.matches(PathContainer.parsePath(request.requestURI))
    }
}
