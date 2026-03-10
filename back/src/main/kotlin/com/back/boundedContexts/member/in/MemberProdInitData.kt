package com.back.boundedContexts.member.`in`

import com.back.boundedContexts.member.app.MemberFacade
import com.back.global.app.AppConfig
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.transaction.annotation.Transactional

@Profile("prod")
@Configuration
class MemberProdInitData(
    private val memberFacade: MemberFacade,
) {
    @Lazy
    @Autowired
    private lateinit var self: MemberProdInitData

    @Bean
    @Order(2)
    fun memberProdInitDataApplicationRunner(): ApplicationRunner {
        return ApplicationRunner {
            self.ensureConfiguredAdminMember()
        }
    }

    @Transactional
    fun ensureConfiguredAdminMember() {
        val adminUsername = AppConfig.adminUsernameOrBlank.trim()
        val adminPassword = AppConfig.adminPasswordOrBlank

        if (adminUsername.isBlank()) return
        if (adminPassword.isBlank()) return
        if (memberFacade.findByUsername(adminUsername) != null) return

        val member = memberFacade.join(
            username = adminUsername,
            password = adminPassword,
            nickname = "관리자",
            profileImgUrl = null,
        )

        member.modifyApiKey(member.username)
    }
}
