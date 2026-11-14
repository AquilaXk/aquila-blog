package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.support.BaseTransactionalIntegrationTest
import jakarta.persistence.EntityManager
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.TestPropertySource

@TestPropertySource(
    properties = [
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.task.scheduling.enabled=false",
        "custom.task.processor.enabled=false",
        "custom.runtime.worker-enabled=false",
    ],
)
class PostInteractionReadStateIntegrationTest : BaseTransactionalIntegrationTest() {
    @Autowired
    private lateinit var postUseCase: PostUseCase

    @Autowired
    private lateinit var postRepository: PostRepositoryPort

    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var entityManager: EntityManager

    @Autowired
    private lateinit var entityManagerFactory: EntityManagerFactory

    @Test
    fun `findInteractionReadStateById는 TOAST 본문 없이 단일 스칼라 쿼리로 가독성과 카운터를 조회한다`() {
        val author = memberApplicationService.join("interactuser", "Password123!", "작성자", null, "interact@example.com")
        val post =
            postUseCase.write(
                author,
                "interaction-state-title",
                "x".repeat(8_000),
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        entityManager.flush()
        entityManager.clear()

        val statistics = entityManagerFactory.unwrap(SessionFactory::class.java).statistics
        val wasEnabled = statistics.isStatisticsEnabled
        statistics.isStatisticsEnabled = true
        try {
            statistics.clear()
            val state = checkNotNull(postUseCase.findInteractionReadStateById(post.id))
            val missing = postUseCase.findInteractionReadStateById(Long.MAX_VALUE)

            assertThat(statistics.prepareStatementCount).isEqualTo(2L)
            assertThat(statistics.entityLoadCount).isZero()
            assertThat(state.id).isEqualTo(post.id)
            assertThat(state.authorId).isEqualTo(author.id)
            assertThat(state.published).isTrue()
            assertThat(state.hitCount).isZero()
            assertThat(state.likesCount).isZero()
            assertThat(missing).isNull()
            assertThat(postRepository.existsById(post.id)).isTrue()
            assertThat(postRepository.existsById(Long.MAX_VALUE)).isFalse()
        } finally {
            statistics.isStatisticsEnabled = wasEnabled
        }
    }
}
