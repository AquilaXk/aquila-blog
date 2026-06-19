package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.subContexts.notification.adapter.persistence.MemberNotificationRepository
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.application.service.PostInteractionSideEffectPayload
import com.back.global.task.adapter.persistence.TaskRepository
import com.back.global.task.application.TaskFacade
import com.back.global.task.model.Task
import com.back.standard.extensions.getOrThrow
import com.back.support.BaseSeededIntegrationTest
import jakarta.persistence.EntityManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.domain.PageRequest
import tools.jackson.databind.ObjectMapper

@org.junit.jupiter.api.DisplayName("MemberNotificationEventListener 테스트")
class MemberNotificationEventListenerTest : BaseSeededIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var postApplicationService: PostApplicationService

    @Autowired
    private lateinit var memberNotificationRepository: MemberNotificationRepository

    @Autowired
    private lateinit var taskRepository: TaskRepository

    @Autowired
    private lateinit var taskFacade: TaskFacade

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @Autowired
    private lateinit var entityManager: EntityManager

    @BeforeEach
    fun setUp() {
        memberNotificationRepository.deleteAllInBatch()
        entityManager.clear()
    }

    @Test
    fun `다른 사람 글에 댓글을 달면 글 작성자에게 POST_COMMENT 알림이 생성된다`() {
        val author = actorApplicationService.findByLoginId("user1").getOrThrow()
        val commenter = actorApplicationService.findByLoginId("user3").getOrThrow()
        val post = postApplicationService.write(author, "알림 테스트 글", "본문", true, true)

        val previousTaskIds = postInteractionSideEffectTaskIds()
        postApplicationService.writeComment(commenter, post, "안녕하세요")
        firePostInteractionSideEffectsSince(previousTaskIds)

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
    fun `댓글 작성 이벤트 task가 재실행되어도 같은 알림은 중복 생성되지 않는다`() {
        val author = actorApplicationService.findByLoginId("user1").getOrThrow()
        val commenter = actorApplicationService.findByLoginId("user3").getOrThrow()
        val post = postApplicationService.write(author, "알림 멱등 테스트 글", "본문", true, true)

        val previousTaskIds = postInteractionSideEffectTaskIds()
        postApplicationService.writeComment(commenter, post, "한 번만 보여야 하는 댓글")
        val commentTask =
            postInteractionSideEffectTasksSince(previousTaskIds)
                .single { task -> task.payload.contains("PostCommentWrittenEvent") }
        val payload = objectMapper.readValue(commentTask.payload, PostInteractionSideEffectPayload::class.java)

        taskFacade.fire(payload)
        taskFacade.fire(payload)

        entityManager.clear()

        val notifications =
            memberNotificationRepository.findLatestByReceiverId(
                author.id,
                PageRequest.of(0, 20),
            )

        assertThat(notifications).hasSize(1)
        assertThat(notifications.first().eventUid).isEqualTo(payload.domainEventUid)
    }

    @Test
    fun `다른 사람 댓글에 답글을 달면 부모 댓글 작성자에게 COMMENT_REPLY 알림이 생성된다`() {
        val author = actorApplicationService.findByLoginId("user1").getOrThrow()
        val replier = actorApplicationService.findByLoginId("user3").getOrThrow()
        val post = postApplicationService.write(author, "답글 알림 테스트", "본문", true, true)
        val parentComment = postApplicationService.writeComment(author, post, "부모 댓글")

        val previousTaskIds = postInteractionSideEffectTaskIds()
        postApplicationService.writeComment(replier, post, "답글입니다", parentComment)
        firePostInteractionSideEffectsSince(previousTaskIds)

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
    fun `답글 알림은 task 실행 전 부모 댓글이 삭제되어도 부모 댓글 작성자에게 생성된다`() {
        val author = actorApplicationService.findByLoginId("user1").getOrThrow()
        val replier = actorApplicationService.findByLoginId("user3").getOrThrow()
        val post = postApplicationService.write(author, "지연 답글 알림 테스트", "본문", true, true)
        val parentComment = postApplicationService.writeComment(author, post, "삭제될 부모 댓글")

        val previousTaskIds = postInteractionSideEffectTaskIds()
        postApplicationService.writeComment(replier, post, "늦게 처리되는 답글", parentComment)
        val replyTaskIds =
            postInteractionSideEffectTasksSince(previousTaskIds)
                .filter { task -> task.payload.contains("PostCommentWrittenEvent") }
                .map { task -> task.id }
                .toSet()
        postApplicationService.deleteComment(post, parentComment, author)
        firePostInteractionSideEffectTaskIds(replyTaskIds)

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
        assertThat(notification.commentPreview).isEqualTo("늦게 처리되는 답글")
    }

    @Test
    fun `자기 글 또는 자기 댓글에 남긴 댓글은 알림을 만들지 않는다`() {
        val author = actorApplicationService.findByLoginId("user1").getOrThrow()
        val post = postApplicationService.write(author, "셀프 알림 테스트", "본문", true, true)
        val parentComment = postApplicationService.writeComment(author, post, "내 댓글")

        val previousTaskIds = postInteractionSideEffectTaskIds()
        postApplicationService.writeComment(author, post, "내가 다는 답글", parentComment)
        firePostInteractionSideEffectsSince(previousTaskIds)

        entityManager.clear()

        val notifications =
            memberNotificationRepository.findLatestByReceiverId(
                author.id,
                PageRequest.of(0, 20),
            )

        assertThat(notifications).isEmpty()
    }

    private fun postInteractionSideEffectTaskIds(): Set<Long> =
        taskRepository
            .findAll()
            .filter { task -> task.taskType == PostInteractionSideEffectPayload.TASK_TYPE }
            .map { task -> task.id }
            .toSet()

    private fun postInteractionSideEffectTasksSince(previousTaskIds: Set<Long>): List<Task> =
        taskRepository
            .findAll()
            .filter { task ->
                task.id !in previousTaskIds && task.taskType == PostInteractionSideEffectPayload.TASK_TYPE
            }

    private fun firePostInteractionSideEffectsSince(previousTaskIds: Set<Long>) {
        postInteractionSideEffectTasksSince(previousTaskIds)
            .forEach { task ->
                val payload = objectMapper.readValue(task.payload, PostInteractionSideEffectPayload::class.java)
                taskFacade.fire(payload)
            }
    }

    private fun firePostInteractionSideEffectTaskIds(taskIds: Set<Long>) {
        taskRepository
            .findAll()
            .filter { task -> task.id in taskIds }
            .forEach { task ->
                val payload = objectMapper.readValue(task.payload, PostInteractionSideEffectPayload::class.java)
                taskFacade.fire(payload)
            }
    }
}
