package com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence

import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import com.back.support.BaseRepositoryIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant

@DisplayName("MemberSignupVerificationRepository 통합 테스트")
class MemberSignupVerificationRepositoryIntegrationTest : BaseRepositoryIntegrationTest() {
    @Autowired
    private lateinit var repository: MemberSignupVerificationRepository

    @Test
    fun `deleteRetainedBefore removes only expired retained signup verification rows`() {
        val cutoff = Instant.parse("2026-06-23T00:00:00Z")
        val beforeCutoff = cutoff.minusSeconds(1)
        val afterCutoff = cutoff.plusSeconds(1)

        repository.saveAllAndFlush(
            listOf(
                verification("consumed-old@example.com", "consumed-old", afterCutoff).apply {
                    consumedAt = beforeCutoff
                },
                verification("cancelled-old@example.com", "cancelled-old", afterCutoff).apply {
                    cancelledAt = beforeCutoff
                },
                verification("email-expired@example.com", "email-expired", beforeCutoff),
                verification("consumed-fresh@example.com", "consumed-fresh", afterCutoff).apply {
                    consumedAt = afterCutoff
                },
                verification("verified-expired-email@example.com", "verified-expired-email", beforeCutoff).apply {
                    verifiedAt = beforeCutoff
                },
                verification("session-active@example.com", "session-active", afterCutoff).apply {
                    signupSessionTokenHash = "session-active-token"
                    signupSessionExpiresAt = afterCutoff
                },
            ),
        )

        val deleted = repository.deleteRetainedBefore(cutoff, 10)

        assertThat(deleted).isEqualTo(3)
        assertThat(repository.findAll().map { it.email })
            .containsExactlyInAnyOrder(
                "consumed-fresh@example.com",
                "verified-expired-email@example.com",
                "session-active@example.com",
            )
    }

    private fun verification(
        email: String,
        tokenSuffix: String,
        emailVerificationExpiresAt: Instant,
    ): MemberSignupVerification =
        MemberSignupVerification(
            email = email,
            emailVerificationTokenHash = "email-token-$tokenSuffix",
            emailVerificationExpiresAt = emailVerificationExpiresAt,
        )
}
