package com.back.global.app

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder

@Configuration
class AppConfig(
    @Value("\${custom.site.backUrl}")
    siteBackUrl: String,
    @Value("\${custom.site.frontUrl}")
    siteFrontUrl: String,
    @Value("\${custom.systemMemberApiKey}")
    systemMemberApiKey: String,
    @Value("\${custom.admin.username:}")
    adminUsername: String,
    @Value("\${custom.admin.password:}")
    adminPassword: String,
) {
    init {
        Companion.siteBackUrl = siteBackUrl
        Companion.siteFrontUrl = siteFrontUrl
        Companion.systemMemberApiKey = systemMemberApiKey
        Companion.adminUsername = adminUsername
        Companion.adminPassword = adminPassword
    }

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    companion object {
        lateinit var siteBackUrl: String
            private set
        lateinit var siteFrontUrl: String
            private set
        lateinit var systemMemberApiKey: String
            private set
        lateinit var adminUsername: String
            private set
        lateinit var adminPassword: String
            private set
    }
}
