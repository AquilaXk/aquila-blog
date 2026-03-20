package com.back.global.revalidate.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.util.UUID

@Task(
    type = "global.revalidate.home",
    label = "홈 revalidate",
    maxRetries = 5,
    baseDelaySeconds = 30,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 600,
)
/**
 * RevalidateHomePayload는 글로벌 공통 정책을 담당하는 구성요소입니다.
 * 모듈 간 중복을 줄이고 공통 규칙을 일관되게 적용하기 위해 분리되었습니다.
 */
data class RevalidateHomePayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val path: String = "/",
) : TaskPayload
