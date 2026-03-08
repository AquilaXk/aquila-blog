package com.back.boundedContexts.member.`in`

import com.back.boundedContexts.member.app.MemberFacade
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

        val memberSystem = memberFacade.join("system", "1234", "시스템", null)
        memberSystem.modifyApiKey(memberSystem.username)

        val memberHolding = memberFacade.join("holding", "1234", "홀딩", null)
        memberHolding.modifyApiKey(memberHolding.username)

        val memberAdmin = memberFacade.join("admin", "1234", "관리자", null)
        memberAdmin.modifyApiKey(memberAdmin.username)

        val memberUser1 = memberFacade.join("user1", "1234", "유저1", null)
        memberUser1.modifyApiKey(memberUser1.username)

        val memberUser2 = memberFacade.join("user2", "1234", "유저2", null)
        memberUser2.modifyApiKey(memberUser2.username)

        val memberUser3 = memberFacade.join("user3", "1234", "유저3", null)
        memberUser3.modifyApiKey(memberUser3.username)
    }
}