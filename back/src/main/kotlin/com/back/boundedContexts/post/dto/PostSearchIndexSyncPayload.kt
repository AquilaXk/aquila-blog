package com.back.boundedContexts.post.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = "post.search-index.sync",
    label = "게시글 검색 인덱스 동기화",
    maxRetries = 5,
    baseDelaySeconds = 10,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 300,
)
/**
 * PostSearchIndexSyncPayload는 게시글 검색 인덱스(post_tag_index) 동기화 작업 파라미터를 전달합니다.
 */
data class PostSearchIndexSyncPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val postId: Long,
    val fallbackTags: List<String> = emptyList(),
    val forceClear: Boolean = false,
) : TaskPayload
