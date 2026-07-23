package com.back.boundedContexts.post.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = "post.read.prewarm",
    label = "게시글 공개 읽기 캐시 prewarm",
    maxRetries = 2,
    baseDelaySeconds = 5,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 60,
)
/**
 * PostReadPrewarmPayload는 게시글 쓰기 이후 공개 읽기 경로를 선가열하기 위한 작업 파라미터를 전달합니다.
 */
data class PostReadPrewarmPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val tags: List<String> = emptyList(),
    val warmDetail: Boolean = false,
) : TaskPayload
