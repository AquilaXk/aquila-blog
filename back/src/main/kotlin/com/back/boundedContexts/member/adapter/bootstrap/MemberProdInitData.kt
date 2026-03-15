package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.MemberPolicy
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
    private val memberUseCase: MemberUseCase,
) {
    @Lazy
    @Autowired
    private lateinit var self: MemberProdInitData

    @Bean
    @Order(2)
    fun memberProdInitDataApplicationRunner(): ApplicationRunner =
        ApplicationRunner {
            self.ensureConfiguredAdminMember()
        }

    @Transactional
    fun ensureConfiguredAdminMember() {
        val adminUsername = AppConfig.adminUsernameOrBlank.trim()
        val adminPassword = AppConfig.adminPasswordOrBlank

        if (adminUsername.isBlank()) return
        if (adminPassword.isBlank()) return
        val existingAdmin = memberUseCase.findByUsername(adminUsername)
        if (existingAdmin != null) {
            // 과거 배포에서 username 기반 apiKey가 남아있을 수 있어 최초 1회 회전한다.
            if (existingAdmin.apiKey.isBlank() || existingAdmin.apiKey == existingAdmin.username) {
                existingAdmin.modifyApiKey(MemberPolicy.genApiKey())
            }
            return
        }

        val member =
            memberUseCase.join(
                username = adminUsername,
                password = adminPassword,
                nickname = "관리자",
                profileImgUrl = null,
            )

        if (member.apiKey.isBlank() || member.apiKey == member.username) {
            member.modifyApiKey(MemberPolicy.genApiKey())
        }
    }
}
