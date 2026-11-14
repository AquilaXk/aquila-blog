package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.support.BaseTransactionalPerformanceIntegrationTest
import jakarta.persistence.EntityManager
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class PostTempDraftBatchIntegrationTest : BaseTransactionalPerformanceIntegrationTest() {
    @Autowired
    private lateinit var postUseCase: PostUseCase

    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var entityManager: EntityManager

    @Autowired
    private lateinit var entityManagerFactory: EntityManagerFactory

    @Test
    fun `resolveTempDraftPostIds는 다수 작성자 게시글에서도 단일 배치 쿼리로 임시글 ID를 판별한다`() {
        val author1 = memberApplicationService.join("batchuser1", "Password123!", "작성자1", null, "batch1@example.com")
        val author2 = memberApplicationService.join("batchuser2", "Password123!", "작성자2", null, "batch2@example.com")
        val author3 = memberApplicationService.join("batchuser3", "Password123!", "작성자3", null, "batch3@example.com")

        val (temp1, _) = postUseCase.getOrCreateTemp(author1)
        val normal2 =
            postUseCase.write(
                author2,
                "normal-2",
                "content-2",
                published = true,
                listed = true,
                summaryMode = PostSummaryMode.AUTO,
            )
        val (temp3, _) = postUseCase.getOrCreateTemp(author3)
        temp3.isTempDraft = false
        entityManager.flush()
        entityManager.clear()

        val posts = listOf(temp1, normal2, temp3)
        val statistics = entityManagerFactory.unwrap(SessionFactory::class.java).statistics
        val wasEnabled = statistics.isStatisticsEnabled
        statistics.isStatisticsEnabled = true
        try {
            statistics.clear()
            val tempIds = postUseCase.resolveTempDraftPostIds(posts)
            val queryCount = statistics.prepareStatementCount

            assertThat(queryCount).isEqualTo(1L)
            assertThat(tempIds).containsExactlyInAnyOrder(temp1.id, temp3.id)
        } finally {
            statistics.isStatisticsEnabled = wasEnabled
        }
    }
}
