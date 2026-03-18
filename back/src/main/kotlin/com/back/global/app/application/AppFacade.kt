package com.back.global.app.application

import com.back.standard.util.Ut
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/**
 * AppFacade는 글로벌 공통 유스케이스를 조합하는 애플리케이션 계층 구성요소입니다.
 * 트랜잭션 경계, 예외 처리, 후속 동기화(캐시/이벤트/큐)를 함께 관리합니다.
 */

@Component
class AppFacade(
    environment: Environment,
    objectMapper: ObjectMapper,
) {
    init {
        Companion.environment = environment
        Ut.JSON.objectMapper = objectMapper
    }

    companion object {
        private lateinit var environment: Environment
        val isDev: Boolean by lazy { environment.matchesProfiles("dev") }
        val isTest: Boolean by lazy { environment.matchesProfiles("test") }
        val isProd: Boolean by lazy { environment.matchesProfiles("prod") }
        val isNotProd: Boolean by lazy { !isProd }
        val siteCookieDomain: String by lazy { environment.getProperty("custom.site.cookieDomain").orEmpty() }
        val siteFrontUrl: String by lazy { environment.getProperty("custom.site.frontUrl").orEmpty() }
        val siteBackUrl: String by lazy { environment.getProperty("custom.site.backUrl").orEmpty() }
    }
}
