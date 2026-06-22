package com.back.boundedContexts.post.event

import com.back.standard.dto.EventPayload
import java.util.UUID

data class PostAccountDeletionDeletedEvent(
    override val uid: UUID,
    override val aggregateType: String = "Post",
    override val aggregateId: Long,
    val beforeTags: List<String> = emptyList(),
    val afterTags: List<String> = emptyList(),
) : EventPayload
