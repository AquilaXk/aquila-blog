package com.back.global.app

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder

/**
 * AppConfig는 글로벌 공통 정책을 담당하는 구성요소입니다.
 * 모듈 간 중복을 줄이고 공통 규칙을 일관되게 적용하기 위해 분리되었습니다.
 */
@Configuration
class AppConfig(
    @Value("\${custom.site.backUrl}")
    siteBackUrl: String,
    @Value("\${custom.site.frontUrl}")
    siteFrontUrl: String,
    @Value("\${custom.admin.username:}")
    adminUsername: String,
    @Value("\${custom.admin.email:}")
    adminEmail: String,
    @Value("\${custom.admin.password:}")
    adminPassword: String,
) {
    init {
        Companion.siteBackUrl = siteBackUrl
        Companion.siteFrontUrl = siteFrontUrl
        Companion.adminUsername = adminUsername
        Companion.adminEmail = adminEmail
        Companion.adminPassword = adminPassword
    }

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    companion object {
        lateinit var siteBackUrl: String
            private set
        lateinit var siteFrontUrl: String
            private set
        lateinit var adminUsername: String
            private set
        lateinit var adminEmail: String
            private set
        lateinit var adminPassword: String
            private set

        val adminUsernameOrBlank: String
            get() = if (::adminUsername.isInitialized) adminUsername else ""

        val adminPasswordOrBlank: String
            get() = if (::adminPassword.isInitialized) adminPassword else ""

        val adminEmailOrBlank: String
            get() = if (::adminEmail.isInitialized) adminEmail else ""
    }
}
