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
/**
 * `SendSignupVerificationMailPayload` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class SendSignupVerificationMailPayload(
    override val uid: UUID,
    override val aggregateType: String,
    override val aggregateId: Long,
    val toEmail: String,
    val verificationLink: String,
    val expiresAt: Instant,
) : TaskPayload
