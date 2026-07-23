package com.back.global.revalidate.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = "global.revalidate.post-cache-purge",
    label = "게시글 공개 캐시 purge",
    maxRetries = 5,
    baseDelaySeconds = 10,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 300,
)
/**
 * PurgePostReadCachesPayload는 게시글 쓰기 이벤트 이후 CDN cache-tag purge를 비동기로 처리합니다.
 */
data class PurgePostReadCachesPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val beforeTags: List<String> = emptyList(),
    val afterTags: List<String> = emptyList(),
) : TaskPayload
