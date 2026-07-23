package com.back.boundedContexts.post.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = "post.search-engine.mirror",
    label = "게시글 검색엔진 미러링",
    maxRetries = 5,
    baseDelaySeconds = 10,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 300,
)
data class PostSearchEngineMirrorPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val tags: List<String> = emptyList(),
    val deleted: Boolean = false,
    val enqueuedAtEpochMs: Long = System.currentTimeMillis(),
) : TaskPayload
