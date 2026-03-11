package com.back.boundedContexts.post.adapter.`in`.bootstrap

import com.back.boundedContexts.member.application.port.`in`.MemberUseCase
import com.back.boundedContexts.post.application.port.`in`.PostUseCase
import com.back.standard.extensions.getOrThrow
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
class PostNotProdInitData(
    private val memberUseCase: MemberUseCase,
    private val postUseCase: PostUseCase,
) {
    @Lazy
    @Autowired
    private lateinit var self: PostNotProdInitData

    @Bean
    @Order(2)
    fun postNotProdInitDataApplicationRunner(): ApplicationRunner =
        ApplicationRunner {
            self.makeBasePosts()
        }

    @Transactional
    fun makeBasePosts() {
        if (postUseCase.count() > 0) return

        val memberUser1 = memberUseCase.findByUsername("user1").getOrThrow()
        val memberUser2 = memberUseCase.findByUsername("user2").getOrThrow()
        val memberUser3 = memberUseCase.findByUsername("user3").getOrThrow()

        postUseCase.write(memberUser1, "제목 1", "내용 1", true, true)
        postUseCase.write(memberUser2, "제목 2", "내용 2", true, true)
        postUseCase.write(memberUser3, "제목 3", "내용 3", true, true)
        postUseCase.write(memberUser1, "비공개 글", "비공개 내용", false, false)
    }
}
