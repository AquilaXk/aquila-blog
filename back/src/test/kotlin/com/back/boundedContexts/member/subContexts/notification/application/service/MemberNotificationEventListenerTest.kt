package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.subContexts.notification.adapter.persistence.MemberNotificationRepository
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.standard.extensions.getOrThrow
import com.back.support.SeededSpringBootTestSupport
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.PageRequest
import org.springframework.test.context.ActiveProfiles

@ActiveProfiles("test")
@SpringBootTest
@org.junit.jupiter.api.DisplayName("MemberNotificationEventListener 테스트")
class MemberNotificationEventListenerTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var memberNotificationRepository: MemberNotificationRepository

    @Autowired
    private lateinit var entityManager: EntityManager

    @BeforeEach
    fun setUp() {
        memberNotificationRepository.deleteAllInBatch()
        entityManager.clear()
    }

    @Test
    fun `다른 사람 글에 댓글을 달면 글 작성자에게 POST_COMMENT 알림이 생성된다`() {
        val author = actorApplicationService.findByUsername("user1").getOrThrow()
        val commenter = actorApplicationService.findByUsername("user3").getOrThrow()
        val post = postApplicationService.write(author, "알림 테스트 글", "본문", true, true)

        postApplicationService.writeComment(commenter, post, "안녕하세요")

        entityManager.clear()

        val notifications =
            memberNotificationRepository.findLatestByReceiverId(
                author.id,
                PageRequest.of(0, 20),
            )

        assertThat(notifications).hasSize(1)
        val notification = notifications.first()
        assertThat(notification.type).isEqualTo(MemberNotificationType.POST_COMMENT)
        assertThat(notification.receiver.id).isEqualTo(author.id)
        assertThat(notification.actor.id).isEqualTo(commenter.id)
        assertThat(notification.postId).isEqualTo(post.id)
        assertThat(notification.commentPreview).isEqualTo("안녕하세요")
    }

    @Test
    fun `다른 사람 댓글에 답글을 달면 부모 댓글 작성자에게 COMMENT_REPLY 알림이 생성된다`() {
        val author = actorApplicationService.findByUsername("user1").getOrThrow()
        val replier = actorApplicationService.findByUsername("user3").getOrThrow()
        val post = postApplicationService.write(author, "답글 알림 테스트", "본문", true, true)
        val parentComment = postApplicationService.writeComment(author, post, "부모 댓글")

        postApplicationService.writeComment(replier, post, "답글입니다", parentComment)

        entityManager.clear()

        val notifications =
            memberNotificationRepository.findLatestByReceiverId(
                author.id,
                PageRequest.of(0, 20),
            )

        assertThat(notifications).hasSize(1)
        val notification = notifications.first()
        assertThat(notification.type).isEqualTo(MemberNotificationType.COMMENT_REPLY)
        assertThat(notification.receiver.id).isEqualTo(author.id)
        assertThat(notification.actor.id).isEqualTo(replier.id)
        assertThat(notification.postId).isEqualTo(post.id)
        assertThat(notification.commentPreview).isEqualTo("답글입니다")
    }

    @Test
    fun `자기 글 또는 자기 댓글에 남긴 댓글은 알림을 만들지 않는다`() {
        val author = actorApplicationService.findByUsername("user1").getOrThrow()
        val post = postApplicationService.write(author, "셀프 알림 테스트", "본문", true, true)
        val parentComment = postApplicationService.writeComment(author, post, "내 댓글")

        postApplicationService.writeComment(author, post, "내가 다는 답글", parentComment)

        entityManager.clear()

        val notifications =
            memberNotificationRepository.findLatestByReceiverId(
                author.id,
                PageRequest.of(0, 20),
            )

        assertThat(notifications).isEmpty()
    }
}
