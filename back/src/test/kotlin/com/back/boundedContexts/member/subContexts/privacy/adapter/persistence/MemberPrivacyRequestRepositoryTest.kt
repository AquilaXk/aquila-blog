package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAudit
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAuditAction
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestHoldStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIdentityStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIntakeChannel
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

class MemberPrivacyRequestRepositoryTest : BaseRepositoryIntegrationTest() {
    @Autowired
    private lateinit var memberRepository: MemberRepository

    @Autowired
    private lateinit var memberPrivacyRequestRepository: MemberPrivacyRequestRepository

    @Autowired
    private lateinit var memberPrivacyRequestAuditRepository: MemberPrivacyRequestAuditRepository

    @Autowired
    private lateinit var memberAccountDeletionRepository: MemberAccountDeletionRepository

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `retention deletes closed requests without active legal holds only`() {
        val cutoff = Instant.parse("2026-09-01T00:00:00Z")
        val eligible = saveClosedRequest("privacy-retention-eligible")
        val held = saveClosedRequest("privacy-retention-held", MemberPrivacyRequestHoldStatus.ACTIVE)
        val audit =
            memberPrivacyRequestAuditRepository.saveAndFlush(
                MemberPrivacyRequestAudit(
                    requestId = eligible.id,
                    operationId = UUID.randomUUID(),
                    actorMemberId = requireNotNull(eligible.member).id,
                    action = MemberPrivacyRequestAuditAction.HOLD_REVIEWED,
                    occurredAt = cutoff.minusSeconds(2),
                ),
            )

        jdbcTemplate.update(
            "update member_privacy_request set completed_at = ?, modified_at = ? where id in (?, ?)",
            Timestamp.from(cutoff.minusSeconds(1)),
            Timestamp.from(cutoff.minusSeconds(1)),
            eligible.id,
            held.id,
        )

        assertThat(memberPrivacyRequestRepository.deleteClosedBefore(cutoff, 10)).isEqualTo(1)
        assertThat(countRows("member_privacy_request", eligible.id)).isZero()
        assertThat(countRows("member_privacy_request", held.id)).isOne()
        assertThat(countRows("member_privacy_request_audit", audit.id)).isZero()
    }

    @Test
    fun `email identity states preserve the unlinked and tombstone-link invariants`() {
        val requestedAt = Instant.parse("2026-09-01T00:00:00Z")
        val owner = memberRepository.saveAndFlush(Member(0, "privacy-owner", "1234", "privacy-owner"))
        val subject = memberRepository.saveAndFlush(Member(0, "privacy-deleted", "1234", "privacy-deleted"))
        val tombstone =
            memberAccountDeletionRepository.saveAndFlush(
                MemberAccountDeletion(memberId = subject.id, deletedAt = requestedAt),
            )

        val pending =
            memberPrivacyRequestRepository.saveAndFlush(
                MemberPrivacyRequest(
                    type = MemberPrivacyRequestType.EXPORT,
                    intakeChannel = MemberPrivacyRequestIntakeChannel.EMAIL,
                    identityStatus = MemberPrivacyRequestIdentityStatus.IDENTITY_PENDING,
                    requesterContact = "subject@example.com",
                    assignedOwnerId = owner.id,
                    requestedAt = requestedAt,
                    dueAt = requestedAt.plusSeconds(10 * 24 * 60 * 60L),
                ),
            )
        val verified =
            memberPrivacyRequestRepository.saveAndFlush(
                MemberPrivacyRequest(
                    accountDeletionId = tombstone.id,
                    type = MemberPrivacyRequestType.EXPORT,
                    intakeChannel = MemberPrivacyRequestIntakeChannel.EMAIL,
                    identityStatus = MemberPrivacyRequestIdentityStatus.VERIFIED_MANUAL,
                    requesterContact = "subject@example.com",
                    assignedOwnerId = owner.id,
                    identityVerifiedById = owner.id,
                    identityVerifiedAt = requestedAt,
                    requestedAt = requestedAt,
                    dueAt = requestedAt.plusSeconds(10 * 24 * 60 * 60L),
                ),
            )

        assertThat(pending.member).isNull()
        assertThat(pending.accountDeletionId).isNull()
        assertThat(verified.member).isNull()
        assertThat(verified.accountDeletionId).isEqualTo(tombstone.id)
    }

    private fun saveClosedRequest(
        username: String,
        holdStatus: MemberPrivacyRequestHoldStatus = MemberPrivacyRequestHoldStatus.CLEARED,
    ): MemberPrivacyRequest {
        val member = memberRepository.saveAndFlush(Member(0, username, "1234", username, "$username@example.com"))
        return memberPrivacyRequestRepository.saveAndFlush(
            MemberPrivacyRequest(
                member = member,
                type = MemberPrivacyRequestType.EXPORT,
                status = MemberPrivacyRequestStatus.COMPLETED,
                requestedAt = Instant.parse("2026-07-01T00:00:00Z"),
                dueAt = Instant.parse("2026-07-11T00:00:00Z"),
                completedAt = Instant.parse("2026-07-02T00:00:00Z"),
                holdStatus = holdStatus,
                holdScope = if (holdStatus == MemberPrivacyRequestHoldStatus.ACTIVE) "LEGAL_REVIEW" else null,
                holdReason = if (holdStatus == MemberPrivacyRequestHoldStatus.ACTIVE) "pending review" else null,
                holdReviewedById = if (holdStatus == MemberPrivacyRequestHoldStatus.ACTIVE) member.id else null,
                holdReviewedAt = if (holdStatus == MemberPrivacyRequestHoldStatus.ACTIVE) Instant.parse("2026-07-02T00:00:00Z") else null,
            ),
        )
    }

    private fun countRows(
        table: String,
        id: Long,
    ): Int =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select count(*) from $table where id = ?",
                Int::class.java,
                id,
            ),
        )
}
