package com.back.boundedContexts.member.subContexts.signupVerification.dto

import com.back.global.task.annotation.Task
import com.back.standard.dto.TaskPayload
import java.time.Instant
import java.util.UUID

@Task("member.signupVerification.sendMail")
data class SendSignupVerificationMailPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Int,
    val toEmail: String,
    val verificationLink: String,
    val expiresAt: Instant,
) : TaskPayload
