package com.back.global.session.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.session.web.http.CookieHttpSessionIdResolver
import org.springframework.session.web.http.HttpSessionIdResolver

/**
 * SessionConfig는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Configuration
class SessionConfig {
    private val sessionPathsPrefixes =
        listOf(
            "/oauth2/",
            "/login/oauth2/",
        )

    /**
     * httpSessionIdResolver 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @Bean
    fun httpSessionIdResolver(): HttpSessionIdResolver {
        val delegate = CookieHttpSessionIdResolver()

        return object : HttpSessionIdResolver {
            /**
             * 입력/환경 데이터를 파싱·정규화해 내부 처리에 안전한 값으로 변환합니다.
             * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
             */
            override fun resolveSessionIds(request: HttpServletRequest): MutableList<String> {
                if (!shouldUseSession(request.requestURI)) return mutableListOf()
                return delegate.resolveSessionIds(request)
            }

            /**
             * setSessionId 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
             * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
             */
            override fun setSessionId(
                request: HttpServletRequest,
                response: HttpServletResponse,
                sessionId: String,
            ) {
                if (!shouldUseSession(request.requestURI)) return
                delegate.setSessionId(request, response, sessionId)
            }

            /**
             * 쿠키 속성을 정책에 맞게 설정하고 보안 플래그를 강제합니다.
             * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
             */
            override fun expireSession(
                request: HttpServletRequest,
                response: HttpServletResponse,
            ) {
                if (!shouldUseSession(request.requestURI)) return
                delegate.expireSession(request, response)
            }

            private fun shouldUseSession(uri: String): Boolean = sessionPathsPrefixes.any { uri.startsWith(it) }
        }
    }
}
