package com.back.boundedContexts.member.subContexts.oauthSignup.model

import com.back.global.jpa.domain.BaseTime
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.SequenceGenerator
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant

@Entity
@Table(
    name = "pending_oauth_signup",
    uniqueConstraints = [
        UniqueConstraint(
            name = "uk_pending_oauth_signup_provider_subject_hash",
            columnNames = ["provider", "provider_subject_hash"],
        ),
        UniqueConstraint(
            name = "uk_pending_oauth_signup_pending_token_hash",
            columnNames = ["pending_token_hash"],
        ),
    ],
)
class PendingOAuthSignup(
    @field:Id
    @field:SequenceGenerator(
        name = "pending_oauth_signup_seq_gen",
        sequenceName = "pending_oauth_signup_seq",
        allocationSize = 20,
    )
    @field:GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "pending_oauth_signup_seq_gen")
    override val id: Long = 0,
    @field:Column(nullable = false, length = 32)
    val provider: String,
    @field:Column(nullable = false, length = 128)
    val providerSubjectHash: String,
    @field:Column(nullable = false, length = 80)
    val memberLoginId: String,
    @field:Column(nullable = false, length = 128)
    var pendingTokenHash: String,
    @field:Column(nullable = false)
    var pendingTokenExpiresAt: Instant,
    @field:Column(nullable = false, length = 30)
    var nickname: String,
    @field:Column(length = 2048)
    var profileImgUrl: String? = null,
    @field:Column
    var consumedAt: Instant? = null,
    @field:Column
    var cancelledAt: Instant? = null,
) : BaseTime(id)
