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

@Profile("!prod")
@Configuration
class MemberNotProdInitData(
    private val memberFacade: MemberFacade
) {
    @Lazy
    @Autowired
    private lateinit var self: MemberNotProdInitData

    @Bean
    @Order(1)
    fun memberNotProdInitDataApplicationRunner(): ApplicationRunner {
        return ApplicationRunner {
            self.makeBaseMembers()
        }
    }

    @Transactional
    fun makeBaseMembers() {
        if (memberFacade.count() > 0) return

        val adminUsername = AppConfig.adminUsernameOrBlank.trim().ifBlank { "admin" }
        val seedMembers = linkedMapOf(
            "system" to "시스템",
            "holding" to "홀딩",
            // 관리자 계정은 환경설정 username 기준으로 단일 생성한다.
            adminUsername to "관리자",
            "user1" to "유저1",
            "user2" to "유저2",
            "user3" to "유저3",
        )

        seedMembers.forEach { (username, nickname) ->
            val member = memberFacade.join(username, "1234", nickname, null)
            member.modifyApiKey(member.username)
        }
    }
}
