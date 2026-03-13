package com.back.boundedContexts.member.subContexts.signupVerification.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.time.Instant
import java.util.UUID

@Task(
    type = "member.signupVerification.sendMail",
    label = "회원가입 메일 발송",
    maxRetries = 6,
    baseDelaySeconds = 120,
    backoffMultiplier = 2.0,
    maxDelaySeconds = 3600,
)
data class SendSignupVerificationMailPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Int,
    val toEmail: String,
    val verificationLink: String,
    val expiresAt: Instant,
) : TaskPayload
