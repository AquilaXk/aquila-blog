package com.back.boundedContexts.member.subContexts.memberActionLog.application.service

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.boundedContexts.member.subContexts.memberActionLog.dto.MemberCreateActionLogPayload
import com.back.boundedContexts.post.dto.PostDto
import com.back.boundedContexts.post.event.PostDeletedEvent
import com.back.boundedContexts.post.event.PostModifiedEvent
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
    @DisplayName("retained action-log task keeps the exact event identity")
    fun retainedTaskPayloadKeepsEventIdentity() {
        val event = unknownEvent()

        val payload =
            MemberCreateActionLogPayload(
                uid = event.uid,
                aggregateType = event.aggregateType,
                aggregateId = event.aggregateId,
                event = event,
            )

        assertThat(payload.uid).isEqualTo(event.uid)
        assertThat(payload.aggregateType).isEqualTo(event.aggregateType)
        assertThat(payload.aggregateId).isEqualTo(event.aggregateId)
        assertThat(payload.event).isSameAs(event)
    }

    @Test
    @DisplayName("모든 action log 이벤트는 구조 metadata로 저장한다")
    fun saveAllSupportedEventsStoresStructuredMetadata() {
        // given
        val repository = RecordingMemberActionLogRepository()
        val service = MemberActionLogApplicationService(repository)
        val postDto = testPostDto(title = "canary secret post title")
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
            )

        // when
        events.forEach(service::save)
        service.save(unknownEvent())

        // then
        assertThat(repository.saved).hasSize(events.size)
        assertThat(repository.saved.map { it.data }).allSatisfy { data ->
            assertThat(data).contains("structured_audit_v1")
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

    private fun javaGetterValues(memberActionLog: MemberActionLog): Map<String, Any?> =
        listOf(
            "getId",
            "getType",
            "getPrimaryType",
            "getPrimaryId",
            "getPrimaryOwner",
            "getSecondaryType",
            "getSecondaryId",
            "getSecondaryOwner",
            "getActor",
            "getData",
        ).associateWith { getterName ->
            MemberActionLog::class.java.getMethod(getterName).invoke(memberActionLog)
        }

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
            hitCount = 0,
        )

    private fun testMemberDto(id: Long): MemberDto =
        MemberDto(
            id = id,
            createdAt = Instant.EPOCH,
            modifiedAt = Instant.EPOCH,
            isAdmin = false,
            name = "작성자",
        )

    private fun unknownEvent(): EventPayload =
        object : EventPayload {
            override val uid: UUID = UUID.randomUUID()
            override val aggregateType: String = "Unknown"
            override val aggregateId: Long = 0
        }
}
