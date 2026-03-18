package com.back.boundedContexts.member.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.global.app.AppConfig
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.ApplicationRunner
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
@Profile("!prod")
@Configuration
class MemberNotProdInitData(
    private val memberUseCase: MemberUseCase,
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

    /**
     * makeBaseMembers 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 부트스트랩 단계에서 중복 실행/기존 데이터 충돌을 방지하며 초기 상태를 맞춥니다.
     */
    @Transactional
    fun makeBaseMembers() {
        val adminUsername = AppConfig.adminUsernameOrBlank.trim().ifBlank { "admin" }
        val seedMembers =
            linkedMapOf(
                "system" to "시스템",
                "holding" to "홀딩",
                // 관리자 계정은 환경설정 username 기준으로 단일 생성한다.
                adminUsername to "관리자",
                "user1" to "유저1",
                "user2" to "유저2",
                "user3" to "유저3",
            )

        seedMembers.forEach { (username, nickname) ->
            if (memberUseCase.findByUsername(username) == null) {
                memberUseCase.join(username, "1234", nickname, null)
            }
        }
    }
}
