package com.back.boundedContexts.member.subContexts.signupVerification.domain

import com.back.global.exception.app.AppException
import com.back.global.jpa.domain.AfterDDL
import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.SequenceGenerator
import java.time.Instant

@Entity
@AfterDDL(
    """
    CREATE INDEX IF NOT EXISTS member_signup_verification_idx_email_created_at_desc
    ON member_signup_verification (email, created_at DESC)
    """,
)
class MemberSignupVerification(
    @field:Id
    @field:SequenceGenerator(
        name = "member_signup_verification_seq_gen",
        sequenceName = "member_signup_verification_seq",
        allocationSize = 20,
    )
    @field:GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "member_signup_verification_seq_gen")
    override val id: Int = 0,
    @field:Column(nullable = false)
    val email: String,
    @field:Column(unique = true, nullable = false, length = 120)
    var emailVerificationToken: String,
    @field:Column(nullable = false)
    var emailVerificationExpiresAt: Instant,
    @field:Column(unique = true, length = 120)
    var signupSessionToken: String? = null,
    @field:Column
    var signupSessionExpiresAt: Instant? = null,
    @field:Column
    var verifiedAt: Instant? = null,
    @field:Column
    var consumedAt: Instant? = null,
    @field:Column
    var cancelledAt: Instant? = null,
) : BaseTime(id) {
    fun cancel(now: Instant) {
        cancelledAt = now
    }

    fun ensureVerifiable(now: Instant) {
        if (cancelledAt != null || consumedAt != null) {
            throw AppException("410-1", "회원가입 링크가 더 이상 유효하지 않습니다.")
        }

        if (verifiedAt == null && emailVerificationExpiresAt.isBefore(now)) {
            throw AppException("410-1", "회원가입 링크가 만료되었습니다. 다시 시도해주세요.")
        }
    }

    fun issueSignupSession(
        token: String,
        expiresAt: Instant,
        now: Instant,
    ) {
        verifiedAt = verifiedAt ?: now
        signupSessionToken = token
        signupSessionExpiresAt = expiresAt
    }

    fun ensureCompletable(now: Instant) {
        if (cancelledAt != null || consumedAt != null) {
            throw AppException("410-1", "회원가입 세션이 더 이상 유효하지 않습니다.")
        }

        if (verifiedAt == null || signupSessionToken.isNullOrBlank() || signupSessionExpiresAt == null) {
            throw AppException("401-4", "이메일 인증이 완료되지 않았습니다.")
        }

        if (signupSessionExpiresAt!!.isBefore(now)) {
            throw AppException("410-1", "회원가입 세션이 만료되었습니다. 이메일 인증부터 다시 진행해주세요.")
        }
    }

    fun consume(now: Instant) {
        consumedAt = now
    }
}
