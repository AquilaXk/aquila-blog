package com.back.boundedContexts.member.subContexts.oauthSignup.model

import com.back.global.exception.application.AppException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("PendingOAuthSignup 테스트")
class PendingOAuthSignupTest {
    @Test
    fun `refresh는 token과 만료시각과 프로필을 갱신하고 취소 상태를 해제한다`() {
        val pending =
            pendingOAuthSignup(
                id = 11,
                profileImgUrl = "https://old.example/profile.png",
            )
        pending.cancel(Instant.EPOCH.plusSeconds(1))

        pending.refresh(
            pendingTokenHash = "new-token-hash",
            expiresAt = Instant.EPOCH.plusSeconds(600),
            nickname = "새닉네임",
            profileImgUrl = "https://new.example/profile.png",
        )

        assertThat(pending.id).isEqualTo(11)
        assertThat(pending.pendingTokenHash).isEqualTo("new-token-hash")
        assertThat(pending.pendingTokenExpiresAt).isEqualTo(Instant.EPOCH.plusSeconds(600))
        assertThat(pending.nickname).isEqualTo("새닉네임")
        assertThat(pending.profileImgUrl).isEqualTo("https://new.example/profile.png")
        assertThat(pending.cancelledAt).isNull()
    }

    @Test
    fun `consume은 readable pending만 소비한다`() {
        val pending = pendingOAuthSignup()
        val pendingWithoutProfile =
            PendingOAuthSignup(
                provider = "KAKAO",
                providerSubjectHash = "subject-hash",
                memberLoginId = "KAKAO__subject-hash",
                pendingTokenHash = "token-hash",
                pendingTokenExpiresAt = Instant.EPOCH.plusSeconds(300),
                nickname = "카카오닉네임",
            )

        assertThat(pending.profileImgUrl).isNull()
        assertThat(pendingWithoutProfile.profileImgUrl).isNull()
        pending.consume(Instant.EPOCH.plusSeconds(1))

        assertThat(pending.consumedAt).isEqualTo(Instant.EPOCH.plusSeconds(1))
        assertThatThrownBy { pending.ensureReadable(Instant.EPOCH.plusSeconds(2)) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("더 이상 유효하지 않습니다")
    }

    @Test
    fun `cancelled pending과 expired pending은 읽을 수 없다`() {
        val cancelled = pendingOAuthSignup()
        cancelled.cancel(Instant.EPOCH.plusSeconds(1))
        val expired =
            pendingOAuthSignup(
                expiresAt = Instant.EPOCH.plusSeconds(10),
            )

        assertThatThrownBy { cancelled.ensureReadable(Instant.EPOCH.plusSeconds(2)) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("더 이상 유효하지 않습니다")
        assertThatThrownBy { expired.ensureReadable(Instant.EPOCH.plusSeconds(11)) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("만료되었습니다")
    }
}

private fun pendingOAuthSignup(
    id: Long = 0,
    expiresAt: Instant = Instant.EPOCH.plusSeconds(300),
    profileImgUrl: String? = null,
): PendingOAuthSignup =
    PendingOAuthSignup(
        id = id,
        provider = "KAKAO",
        providerSubjectHash = "subject-hash",
        memberLoginId = "KAKAO__subject-hash",
        pendingTokenHash = "token-hash",
        pendingTokenExpiresAt = expiresAt,
        nickname = "카카오닉네임",
        profileImgUrl = profileImgUrl,
    )
