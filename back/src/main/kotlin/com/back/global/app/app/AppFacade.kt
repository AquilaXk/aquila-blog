package com.back.global.app.app

import com.back.standard.util.Ut
import org.springframework.core.env.Environment
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

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
        val systemMemberApiKey: String by lazy { environment.getProperty("custom.systemMemberApiKey")!! }
        val siteCookieDomain: String by lazy { environment.getProperty("custom.site.cookieDomain")!! }
        val siteFrontUrl: String by lazy { environment.getProperty("custom.site.frontUrl")!! }
        val siteBackUrl: String by lazy { environment.getProperty("custom.site.backUrl")!! }
    }
}
