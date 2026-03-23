package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.transaction.annotation.Transactional
import java.util.Locale

/**
 * MemberProdInitData는 환경별 초기 데이터/부트스트랩 로직을 담당합니다.
 * 애플리케이션 기동 시 필요한 기본 상태를 안전하게 준비합니다.
 */
@Profile("prod")
@Configuration
class MemberProdInitData(
    private val memberUseCase: MemberUseCase,
    private val passwordEncoder: PasswordEncoder,
) {
    private val logger = LoggerFactory.getLogger(MemberProdInitData::class.java)

    @Lazy
    @Autowired
    private lateinit var self: MemberProdInitData

    @Bean
    @Order(2)
    fun memberProdInitDataApplicationRunner(): ApplicationRunner =
        ApplicationRunner {
            self.ensureConfiguredAdminMember()
        }

    /**
     * 검증 규칙을 적용해 허용 여부를 판정합니다.
     * 초기화 단계에서 중복 생성 방지와 기본값 보정을 함께 수행합니다.
     */
    @Transactional
    fun ensureConfiguredAdminMember() {
        val configuredAdminUsername = AppConfig.adminUsernameOrBlank.trim()
        val adminNickname = configuredAdminUsername.ifBlank { "관리자" }
        val adminEmail = AppConfig.adminEmailOrBlank.trim().lowercase(Locale.ROOT)
        val adminPassword = AppConfig.adminPasswordOrBlank

        if (adminEmail.isBlank()) return
        if (adminPassword.isBlank()) return
        logger.info("Configured admin identity bootstrap started. email={} nickname={}", adminEmail, adminNickname)
        val existingAdmin =
            memberUseCase.findByEmail(adminEmail)
        if (existingAdmin != null) {
            val hasPassword = !existingAdmin.password.isNullOrBlank()
            val passwordMatchesConfigured = hasPassword && passwordEncoder.matches(adminPassword, existingAdmin.password)

            if (!hasPassword) {
                existingAdmin.password = passwordEncoder.encode(adminPassword)
            } else if (!passwordMatchesConfigured) {
                existingAdmin.password = passwordEncoder.encode(adminPassword)
                logger.warn("Admin password rotated to match configured custom.admin.password")
            }
            // 과거 배포에서 username 기반 apiKey가 남아있을 수 있어 최초 1회 회전한다.
            if (existingAdmin.apiKey.isBlank() || existingAdmin.apiKey == existingAdmin.username) {
                existingAdmin.modifyApiKey(MemberPolicy.genApiKey())
            }
            val owner = memberUseCase.findByEmail(adminEmail)
            if (owner == null || owner.id == existingAdmin.id) {
                existingAdmin.email = adminEmail
            } else {
                throw AppException(
                    "409-2",
                    "관리자 이메일($adminEmail)이 다른 계정(memberId=${owner.id})에 이미 연결되어 있습니다. 기존 계정을 정리한 뒤 다시 기동해주세요.",
                )
            }
            if (existingAdmin.nickname != adminNickname) {
                existingAdmin.nickname = adminNickname
            }
            return
        }

        val member =
            memberUseCase.joinWithVerifiedEmail(
                email = adminEmail,
                password = adminPassword,
                nickname = adminNickname,
                profileImgUrl = null,
            )

        if (member.apiKey.isBlank() || member.apiKey == member.username) {
            member.modifyApiKey(MemberPolicy.genApiKey())
        }
    }
}
