package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.support.BasePostApplicationServiceAfterCommitIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.mockingDetails
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.support.TransactionTemplate

@DisplayName("PostApplicationService 후속 작업 AFTER_COMMIT 테스트")
class PostApplicationServiceAfterCommitTest : BasePostApplicationServiceAfterCommitIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var transactionTemplate: TransactionTemplate

    @Test
    @DisplayName("글 작성 트랜잭션이 rollback되면 첨부파일·추천 후속 작업을 실행하지 않는다")
    fun writeRollbackDoesNotRunSideEffects() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!

        // when
        transactionTemplate.executeWithoutResult { status ->
            postApplicationService.write(
                author = admin,
                title = "rollback after commit guard",
                content = "rollback content",
                published = true,
                listed = true,
            )
            status.setRollbackOnly()
        }

        // then
        verifyNoInteractions(
            uploadedFileRetentionService,
            postRecommendFeatureStoreService,
        )
    }

    @Test
    @DisplayName("글 작성 트랜잭션이 commit되면 첨부파일·추천 후속 작업을 실행한다")
    fun writeCommitRunsSideEffects() {
        // given
        clearSideEffectMocks()
        val admin = actorApplicationService.findByEmail("admin@test.com")!!

        // when
        transactionTemplate.executeWithoutResult {
            postApplicationService.write(
                author = admin,
                title = "commit after commit guard",
                content = "commit content",
                published = true,
                listed = true,
            )
        }

        // then
        assertThat(invokedMethodNames(uploadedFileRetentionService)).contains("syncPostContent")
        assertThat(invokedMethodNames(postRecommendFeatureStoreService)).contains("refresh")
    }

    private fun clearSideEffectMocks() {
        clearInvocations(
            uploadedFileRetentionService,
            postRecommendFeatureStoreService,
            eventPublisher,
            cacheManager,
        )
    }

    private fun invokedMethodNames(mock: Any): List<String> = mockingDetails(mock).invocations.map { it.method.name }
}
