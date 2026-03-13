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
data class RevalidateHomePayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Int,
    val path: String = "/",
) : TaskPayload
