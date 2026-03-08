package com.back.boundedContexts.member.subContexts.memberActionLog.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.EventPayload
import com.back.standard.dto.TaskPayload
import java.util.*

@Task("member.createActionLog")
class MemberCreateActionLogPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Int,
    val event: EventPayload,
) : TaskPayload
