package com.back.boundedContexts.member.subContexts.memberActionLog.application.service

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.boundedContexts.post.dto.PostCommentDto
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostCommentDeletedEvent
import com.back.boundedContexts.post.event.PostCommentModifiedEvent
import com.back.boundedContexts.post.event.PostCommentWrittenEvent
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostLikedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
import com.back.boundedContexts.post.event.PostUnlikedEvent
import com.back.boundedContexts.post.event.PostWrittenEvent
import com.back.standard.dto.EventPayload
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

@DisplayName("MemberActionLogApplicationService 테스트")
class MemberActionLogApplicationServiceTest {
    @Test
    @DisplayName("action log data는 댓글 본문과 게시글 제목 원문을 저장하지 않는다")
    fun saveCommentEventStoresStructuredMetadataOnly() {
        // given
        val repository = RecordingMemberActionLogRepository()
        val service = MemberActionLogApplicationService(repository)
        val event =
            PostCommentWrittenEvent(
                uid = UUID.fromString("00000000-0000-0000-0000-000000001001"),
                postCommentDto = testCommentDto(content = "canary secret comment body"),
                postDto = testPostDto(title = "canary secret post title"),
                actorDto = testMemberDto(9L),
                replyReceiverId = 3L,
            )

        // when
        service.save(event)

        // then
        val saved = repository.saved.single()
        assertThat(saved.data).contains("structured_audit_v1")
        assertThat(saved.data).contains("\"commentId\":11")
        assertThat(saved.data).contains("\"postId\":22")
        assertThat(saved.data).doesNotContain("canary secret comment body")
        assertThat(saved.data).doesNotContain("canary secret post title")
    }

    @Test
    @DisplayName("모든 action log 이벤트는 구조 metadata로 저장한다")
    fun saveAllSupportedEventsStoresStructuredMetadata() {
        // given
        val repository = RecordingMemberActionLogRepository()
        val service = MemberActionLogApplicationService(repository)
        val postDto = testPostDto(title = "canary secret post title")
        val commentDto = testCommentDto(content = "canary secret comment body")
        val actorDto = testMemberDto(9L)
        val events =
            listOf(
                PostWrittenEvent(
                    UUID.randomUUID(),
                    postDto,
                    actorDto,
                    beforeTags = listOf("old"),
                    afterTags = listOf("new"),
                ),
                PostModifiedEvent(UUID.randomUUID(), postDto, actorDto),
                PostDeletedEvent(UUID.randomUUID(), postDto, actorDto),
                PostCommentWrittenEvent(UUID.randomUUID(), commentDto, postDto, actorDto, replyReceiverId = null),
                PostCommentModifiedEvent(UUID.randomUUID(), commentDto, postDto, actorDto),
                PostCommentDeletedEvent(UUID.randomUUID(), commentDto, postDto, actorDto),
                PostLikedEvent(
                    UUID.randomUUID(),
                    postId = 22L,
                    postAuthorId = 8L,
                    likeId = 33L,
                    actorDto = actorDto,
                ),
                PostUnlikedEvent(
                    UUID.randomUUID(),
                    postId = 22L,
                    postAuthorId = 8L,
                    likeId = 33L,
                    actorDto = actorDto,
                ),
            )

        // when
        events.forEach(service::save)
        service.save(unknownEvent())

        // then
        assertThat(repository.saved).hasSize(events.size)
        assertThat(repository.saved.map { it.data }).allSatisfy { data ->
            assertThat(data).contains("structured_audit_v1")
            assertThat(data).doesNotContain("canary secret comment body")
            assertThat(data).doesNotContain("canary secret post title")
        }
    }

    private class RecordingMemberActionLogRepository : MemberActionLogRepositoryPort {
        val saved = mutableListOf<MemberActionLog>()

        override fun save(memberActionLog: MemberActionLog): MemberActionLog {
            saved += memberActionLog
            return memberActionLog
        }

        override fun deleteCreatedBefore(
            cutoff: Instant,
            limit: Int,
        ): Int = 0
    }

    private fun testCommentDto(content: String): PostCommentDto =
        PostCommentDto(
            id = 11L,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            authorId = 9L,
            authorName = "작성자",
            authorUsername = "author",
            authorProfileImageUrl = "",
            authorProfileImageDirectUrl = "",
            postId = 22L,
            parentCommentId = null,
            content = content,
        )

    private fun testPostDto(title: String): PostDto =
        PostDto(
            id = 22L,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            authorId = 8L,
            authorName = "작성자",
            authorUsername = "author",
            authorProfileImgUrl = "",
            title = title,
            summary = "summary",
            version = 1L,
            published = true,
            listed = true,
            likesCount = 0,
            commentsCount = 0,
            hitCount = 0,
        )

    private fun testMemberDto(id: Long): MemberDto =
        MemberDto(
            id = id,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            isAdmin = false,
            name = "작성자",
            profileImageUrl = "",
        )

    private fun unknownEvent(): EventPayload =
        object : EventPayload {
            override val uid: UUID = UUID.randomUUID()
            override val aggregateType: String = "Unknown"
            override val aggregateId: Long = 0
        }
}
