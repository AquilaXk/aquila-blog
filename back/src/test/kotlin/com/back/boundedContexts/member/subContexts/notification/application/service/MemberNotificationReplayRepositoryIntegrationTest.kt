package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.subContexts.notification.adapter.persistence.MemberNotificationRepository
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseSeededIntegrationTest
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

@DisplayName("MemberNotification replay repository 통합 계약")
class MemberNotificationReplayRepositoryIntegrationTest : BaseSeededIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var repository: MemberNotificationRepository

    @Autowired
    private lateinit var repositoryPort: MemberNotificationRepositoryPort

    @Autowired
    private lateinit var entityManager: EntityManager

    @BeforeEach
    fun setUp() {
        repository.deleteAllInBatch()
        entityManager.clear()
    }

    @Test
    @DisplayName("replay query는 cursor 다음 persisted row를 ID 오름차순·limit 이내로 반환한다")
    fun `replay query returns persisted rows after cursor in order`() {
        val receiver = actorApplicationService.findByLoginId("user1").getOrThrow()
        val actor = actorApplicationService.findByLoginId("user3").getOrThrow()
        val saved =
            (1..3).map { index ->
                repository.saveAndFlush(
                    MemberNotification(
                        receiver = receiver,
                        actor = actor,
                        type = MemberNotificationType.POST_COMMENT,
                        postId = 100L + index,
                        commentId = 200L + index,
                        postTitle = "replay post $index",
                        commentPreview = "replay comment $index",
                        eventUid = UUID.randomUUID(),
                    ),
                )
            }
        entityManager.clear()

        val replay =
            repositoryPort.findByReceiverIdAndIdGreaterThan(
                receiverId = receiver.id,
                lastNotificationId = saved.first().id,
                limit = 2,
            )

        assertThat(replay.map(MemberNotification::id))
            .containsExactly(saved[1].id, saved[2].id)
    }
}
