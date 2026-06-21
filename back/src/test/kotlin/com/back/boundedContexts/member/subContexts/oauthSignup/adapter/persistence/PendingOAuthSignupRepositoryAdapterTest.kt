package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.persistence

import com.back.boundedContexts.member.subContexts.oauthSignup.model.PendingOAuthSignup
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import java.time.Instant

@DisplayName("PendingOAuthSignupRepositoryAdapter 테스트")
class PendingOAuthSignupRepositoryAdapterTest {
    @Test
    fun `repository port 호출을 Spring Data repository로 위임한다`() {
        val repository = mock(PendingOAuthSignupRepository::class.java)
        val adapter = PendingOAuthSignupRepositoryAdapter(repository)
        val pending = pendingOAuthSignup()
        given(repository.save(pending)).willReturn(pending)
        given(repository.findByProviderAndProviderSubjectHash("KAKAO", "subject-hash")).willReturn(pending)
        given(repository.findByPendingTokenHash("token-hash")).willReturn(pending)

        assertThat(adapter.save(pending)).isSameAs(pending)
        assertThat(adapter.findByProviderAndProviderSubjectHash("KAKAO", "subject-hash")).isSameAs(pending)
        assertThat(adapter.findByPendingTokenHash("token-hash")).isSameAs(pending)

        verify(repository).save(pending)
        verify(repository).findByProviderAndProviderSubjectHash("KAKAO", "subject-hash")
        verify(repository).findByPendingTokenHash("token-hash")
    }
}

private fun pendingOAuthSignup(): PendingOAuthSignup =
    PendingOAuthSignup(
        provider = "KAKAO",
        providerSubjectHash = "subject-hash",
        memberLoginId = "KAKAO__subject-hash",
        pendingTokenHash = "token-hash",
        pendingTokenExpiresAt = Instant.EPOCH.plusSeconds(300),
        nickname = "카카오닉네임",
        profileImgUrl = null,
    )
