package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.global.app.AdminProperties
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.ApplicationRunner
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.transaction.annotation.Transactional

/**
 * MemberNotProdInitData는 환경별 초기 데이터/부트스트랩 로직을 담당합니다.
 * 애플리케이션 기동 시 필요한 기본 상태를 안전하게 준비합니다.
 */
@Profile("(local | dev | test) & !prod & !staging & !preview & !qa & !release")
@ConditionalOnProperty(
    prefix = "custom.bootstrap",
    name = ["seed-demo-data-enabled"],
    havingValue = "true",
)
@Configuration
class MemberNotProdInitData(
    private val memberUseCase: MemberUseCase,
    private val adminProperties: AdminProperties,
) {
    @Lazy
    @Autowired
    private lateinit var self: MemberNotProdInitData

    @Bean
    @Order(1)
    fun memberNotProdInitDataApplicationRunner(): ApplicationRunner =
        ApplicationRunner {
            self.makeBaseMembers()
        }

    @Transactional
    fun makeBaseMembers() {
        val adminUsername = adminProperties.username.trim().ifBlank { "admin" }
        val configuredAdminEmail = adminProperties.normalizedEmail
        val adminEmail = configuredAdminEmail.ifBlank { "admin@test.com" }

        data class SeedMember(
            val username: String,
            val nickname: String,
            val email: String,
        )

        val seedMembers =
            linkedMapOf(
                "system@test.com" to SeedMember("system", "시스템", "system@test.com"),
                "holding@test.com" to SeedMember("holding", "홀딩", "holding@test.com"),
                // 관리자 계정은 환경설정 username 기준으로 단일 생성한다.
                adminEmail to SeedMember(adminUsername, "관리자", adminEmail),
                "user1@test.com" to SeedMember("user1", "유저1", "user1@test.com"),
                "user2@test.com" to SeedMember("user2", "유저2", "user2@test.com"),
                "user3@test.com" to SeedMember("user3", "유저3", "user3@test.com"),
            )

        seedMembers.forEach { (email, seed) ->
            val existingMember = memberUseCase.findByEmail(email)
            val member =
                existingMember
                    ?: memberUseCase.join(seed.username, "1234", seed.nickname, null, seed.email)
            if (email == adminEmail) {
                member.grantAdmin()
            }
        }
    }
}
