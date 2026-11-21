package com.back.boundedContexts.member.subContexts.memberActionLog.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import com.back.boundedContexts.post.domain.Post
import com.back.boundedContexts.post.event.*
import com.back.standard.dto.EventPayload
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper

@Service
class MemberActionLogApplicationService(
    private val memberActionLogRepository: MemberActionLogRepositoryPort,
) {
    private val objectMapper = ObjectMapper()

    fun save(event: EventPayload) {
        when (event) {
            is PostWrittenEvent -> savePostWrittenEvent(event)
            is PostModifiedEvent -> savePostModifiedEvent(event)
            is PostDeletedEvent -> savePostDeletedEvent(event)
            else -> {}
        }
    }

    private fun savePostWrittenEvent(event: PostWrittenEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostWrittenEvent::class.simpleName!!,
                primaryType = Post::class.simpleName!!,
                primaryId = event.postDto.id,
                primaryOwner = Member(event.postDto.authorId),
                secondaryType = Member::class.simpleName!!,
                secondaryId = event.actorDto.id,
                secondaryOwner = Member(event.actorDto.id),
                actor = Member(event.actorDto.id),
                data =
                    auditData(
                        event = event,
                        "postId" to event.postDto.id,
                        "actorId" to event.actorDto.id,
                        "beforeTagCount" to event.beforeTags.size,
                        "afterTagCount" to event.afterTags.size,
                    ),
            ),
        )
    }

    private fun savePostModifiedEvent(event: PostModifiedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostModifiedEvent::class.simpleName!!,
                primaryType = Post::class.simpleName!!,
                primaryId = event.postDto.id,
                primaryOwner = Member(event.postDto.authorId),
                secondaryType = Member::class.simpleName!!,
                secondaryId = event.actorDto.id,
                secondaryOwner = Member(event.actorDto.id),
                actor = Member(event.actorDto.id),
                data =
                    auditData(
                        event = event,
                        "postId" to event.postDto.id,
                        "actorId" to event.actorDto.id,
                        "beforeTagCount" to event.beforeTags.size,
                        "afterTagCount" to event.afterTags.size,
                    ),
            ),
        )
    }

    private fun savePostDeletedEvent(event: PostDeletedEvent) {
        memberActionLogRepository.save(
            MemberActionLog(
                type = PostDeletedEvent::class.simpleName!!,
                primaryType = Post::class.simpleName!!,
                primaryId = event.postDto.id,
                primaryOwner = Member(event.postDto.authorId),
                secondaryType = Member::class.simpleName!!,
                secondaryId = event.actorDto.id,
                secondaryOwner = Member(event.actorDto.id),
                actor = Member(event.actorDto.id),
                data =
                    auditData(
                        event = event,
                        "postId" to event.postDto.id,
                        "actorId" to event.actorDto.id,
                        "beforeTagCount" to event.beforeTags.size,
                        "afterTagCount" to event.afterTags.size,
                    ),
            ),
        )
    }

    private fun auditData(
        event: EventPayload,
        vararg fields: Pair<String, Any?>,
    ): String =
        objectMapper.writeValueAsString(
            linkedMapOf<String, Any?>(
                "eventType" to event::class.simpleName,
                "metadataCode" to "structured_audit_v1",
                "aggregateType" to event.aggregateType,
                "aggregateId" to event.aggregateId,
                "eventUid" to event.uid.toString(),
            ).apply {
                fields.forEach { (key, value) ->
                    if (value != null) put(key, value)
                }
            },
        )
}
