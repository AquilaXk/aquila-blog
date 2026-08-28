package com.back.boundedContexts.member.subContexts.notification.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.notification.application.port.output.MemberNotificationRepositoryPort
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotification
import com.back.boundedContexts.member.subContexts.notification.domain.MemberNotificationType
import com.back.boundedContexts.member.subContexts.notification.dto.MemberNotificationDto
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.model.PostSummarySource
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.any
import org.mockito.Mockito.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import java.time.Instant
import java.util.UUID

class MemberNotificationApplicationServiceTest {
    @Test
    fun `retained reply notification keeps the realtime relay payload shape`() {
        val receiver = member(id = 1, username = "author")
        val actor = member(id = 2, username = "commenter")
        val notification =
            MemberNotification(
                id = 30L,
                receiver = receiver,
                actor = actor,
                type = MemberNotificationType.COMMENT_REPLY,
                postId = 20L,
                commentId = 10L,
                postTitle = "Post title",
                commentPreview = "Reply preview",
            ).also {
                it.createdAt = Instant.EPOCH
                it.modifiedAt = Instant.EPOCH
            }
        val dto = MemberNotificationDto(notification)

        val payload =
            MemberNotificationRealtimeRelayService.Payload(
                originNodeId = "node-a",
                memberId = receiver.id,
                notification = dto,
                unreadCount = 1,
            )

        assertThat(dto.message).contains(actor.name).contains("답글")
        assertThat(payload.originNodeId).isEqualTo("node-a")
        assertThat(payload.memberId).isEqualTo(receiver.id)
        assertThat(payload.notification).isSameAs(dto)
        assertThat(payload.unreadCount).isEqualTo(1)
    }

    @Test
    fun `comment event creates one notification when the same queued event is replayed`() {
        val memberRepository = mock(MemberRepositoryPort::class.java)
        val postCommentRepository = mock(PostCommentRepositoryPort::class.java)
        val notificationRepository = mock(MemberNotificationRepositoryPort::class.java)
        val relayService = mock(MemberNotificationRealtimeRelayService::class.java)
        val service =
            MemberNotificationApplicationService(
                memberRepository,
                postCommentRepository,
                notificationRepository,
                relayService,
            )
        val receiver = member(id = 1, username = "author")
        val actor = member(id = 2, username = "commenter")
        val event = commentEvent(receiver, actor)
        given(notificationRepository.existsByEventUid(event.uid)).willReturn(false, true)
        given(memberRepository.getReferenceById(receiver.id)).willReturn(receiver)
        given(memberRepository.getReferenceById(actor.id)).willReturn(actor)
        given(notificationRepository.save(anyValue())).willAnswer { invocation ->
            (invocation.arguments[0] as MemberNotification).also {
                it.createdAt = event.postCommentDto.createdAt
                it.modifiedAt = event.postCommentDto.modifiedAt
            }
        }
        given(notificationRepository.countUnreadByReceiverId(receiver.id)).willReturn(1)

        service.createForCommentWritten(event)
        service.createForCommentWritten(event)

        verify(notificationRepository, times(1)).save(anyValue())
        verify(relayService, times(1)).publish(eq(receiver.id), anyValue(), eq(1))
    }

    private fun commentEvent(
        receiver: Member,
        actor: Member,
    ): PostCommentWrittenEvent {
        val now = Instant.parse("2026-08-28T00:00:00Z")
        val comment =
            PostCommentDto(
                id = 10,
                createdAt = now,
                modifiedAt = now,
                authorId = actor.id,
                authorName = actor.nickname,
                authorUsername = actor.username,
                authorProfileImageUrl = "",
                authorProfileImageDirectUrl = "",
                postId = 20,
                parentCommentId = null,
                content = "queued comment",
            )
        val post =
            PostDto(
                id = 20,
                createdAt = now,
                modifiedAt = now,
                authorId = receiver.id,
                authorName = receiver.nickname,
                authorUsername = receiver.username,
                authorProfileImgUrl = "",
                title = "Post title",
                summary = "",
                version = 0,
                published = true,
                listed = true,
                likesCount = 0,
                commentsCount = 1,
                hitCount = 0,
                summarySource = PostSummarySource.NONE,
            )
        return PostCommentWrittenEvent(UUID.randomUUID(), comment, post, MemberDto(actor), null)
    }

    private fun member(
        id: Long,
        username: String,
    ): Member =
        Member(
            id = id,
            username = username,
            nickname = username,
            email = "$username@example.com",
            apiKey = "api-key-$id",
        ).also {
            val now = Instant.parse("2026-08-28T00:00:00Z")
            it.createdAt = now
            it.modifiedAt = now
        }

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyValue(): T {
        any<T>()
        return null as T
    }
}
