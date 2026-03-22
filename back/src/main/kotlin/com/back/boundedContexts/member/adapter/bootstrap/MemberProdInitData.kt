package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.global.app.AppConfig
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
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
    @param:Value("\${custom.admin.bootstrap.rotatePasswordOnStartup:false}")
    private val rotatePasswordOnStartup: Boolean,
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
        val adminNickname = AppConfig.adminUsernameOrBlank.trim().ifBlank { "관리자" }
        val adminEmail = AppConfig.adminEmailOrBlank.trim().lowercase(Locale.ROOT)
        val adminPassword = AppConfig.adminPasswordOrBlank

        if (adminEmail.isBlank()) return
        if (adminPassword.isBlank()) return
        logger.info("Configured admin nickname from custom.admin.username: {}", adminNickname)
        val existingAdmin =
            memberUseCase.findByEmail(adminEmail)
        if (existingAdmin != null) {
            val hasPassword = !existingAdmin.password.isNullOrBlank()
            val passwordMatchesConfigured = hasPassword && passwordEncoder.matches(adminPassword, existingAdmin.password)

            if (!hasPassword) {
                existingAdmin.password = passwordEncoder.encode(adminPassword)
            } else if (!passwordMatchesConfigured && rotatePasswordOnStartup) {
                existingAdmin.password = passwordEncoder.encode(adminPassword)
                logger.warn("Rotated admin password on startup because custom.admin.bootstrap.rotatePasswordOnStartup=true")
            } else if (!passwordMatchesConfigured) {
                logger.warn(
                    "Admin password differs from configured value but rotation is disabled; set custom.admin.bootstrap.rotatePasswordOnStartup=true to rotate explicitly",
                )
            }
            // 과거 배포에서 username 기반 apiKey가 남아있을 수 있어 최초 1회 회전한다.
            if (existingAdmin.apiKey.isBlank() || existingAdmin.apiKey == existingAdmin.username) {
                existingAdmin.modifyApiKey(MemberPolicy.genApiKey())
            }
            if (adminEmail.isNotBlank()) {
                val owner = memberUseCase.findByEmail(adminEmail)
                if (owner == null || owner.id == existingAdmin.id) {
                    existingAdmin.email = adminEmail
                } else {
                    logger.warn(
                        "Admin email bootstrap skipped because configured email is already used by memberId={}",
                        owner.id,
                    )
                }
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
