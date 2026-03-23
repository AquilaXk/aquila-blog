package com.back.boundedContexts.post.adapter.bootstrap

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.standard.extensions.getOrThrow
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Lazy
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import org.springframework.transaction.annotation.Transactional

/**
 * PostNotProdInitData는 환경별 초기 데이터/부트스트랩 로직을 담당합니다.
 * 애플리케이션 기동 시 필요한 기본 상태를 안전하게 준비합니다.
 */
@Profile("!prod")
@Configuration
class PostNotProdInitData(
    private val memberUseCase: MemberUseCase,
    private val postUseCase: PostUseCase,
    private val postRepository: PostRepositoryPort,
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
        val memberUser1 = memberUseCase.findByEmail("user1@test.com").getOrThrow()
        val memberUser2 = memberUseCase.findByEmail("user2@test.com").getOrThrow()
        val memberUser3 = memberUseCase.findByEmail("user3@test.com").getOrThrow()

        writeIfMissing(memberUser1, "제목 1", "내용 1", true, true)
        writeIfMissing(memberUser2, "제목 2", "내용 2", true, true)
        writeIfMissing(memberUser3, "제목 3", "내용 3", true, true)
        writeIfMissing(memberUser1, "비공개 글", "비공개 내용", false, false)
    }

    /**
     * 생성 요청을 처리하고 멱등성·후속 동기화 절차를 함께 수행합니다.
     * 초기화 단계에서 중복 생성 방지와 기본값 보정을 함께 수행합니다.
     */
    private fun writeIfMissing(
        author: Member,
        title: String,
        content: String,
        published: Boolean,
        listed: Boolean,
    ) {
        if (postRepository.existsByAuthorAndTitle(author, title)) return

        postUseCase.write(author, title, content, published, listed)
    }
}
