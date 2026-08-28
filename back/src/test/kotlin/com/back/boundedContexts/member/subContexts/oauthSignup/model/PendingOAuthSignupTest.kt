package com.back.boundedContexts.member.subContexts.oauthSignup.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant

class PendingOAuthSignupTest {
    @Test
    fun `retained signup row keeps required identity fields and unset lifecycle defaults`() {
        val expiresAt = Instant.parse("2026-08-28T00:00:00Z")

        val pending =
            PendingOAuthSignup(
                provider = "KAKAO",
                providerSubjectHash = "provider-subject-hash",
                memberLoginId = "oauth_KAKAO_provider-subject-hash",
                pendingTokenHash = "pending-token-hash",
                pendingTokenExpiresAt = expiresAt,
                nickname = "가입대기",
            )

        assertThat(pending.id).isZero()
        assertThat(pending.provider).isEqualTo("KAKAO")
        assertThat(pending.providerSubjectHash).isEqualTo("provider-subject-hash")
        assertThat(pending.memberLoginId).isEqualTo("oauth_KAKAO_provider-subject-hash")
        assertThat(pending.pendingTokenHash).isEqualTo("pending-token-hash")
        assertThat(pending.pendingTokenExpiresAt).isEqualTo(expiresAt)
        assertThat(pending.nickname).isEqualTo("가입대기")
        assertThat(pending.profileImgUrl).isNull()
        assertThat(pending.consumedAt).isNull()
        assertThat(pending.cancelledAt).isNull()
    }
}
