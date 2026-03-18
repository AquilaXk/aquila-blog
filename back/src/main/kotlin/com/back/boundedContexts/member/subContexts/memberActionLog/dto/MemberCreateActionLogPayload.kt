package com.back.boundedContexts.member.subContexts.memberActionLog.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.EventPayload
import com.back.standard.dto.TaskPayload
import java.util.*

/**
 * MemberCreateActionLogPayload는 계층 간 데이터 전달에 사용하는 DTO입니다.
 * 도메인 엔티티 직접 노출을 피하고 API/서비스 경계를 명확히 유지합니다.
 */
@Task(
    type = "member.createActionLog",
    label = "회원 액션 로그",
    maxRetries = 4,
    baseDelaySeconds = 60,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 900,
)
class MemberCreateActionLogPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Int,
    val event: EventPayload,
) : TaskPayload
