package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify

class PendingOAuthSignupRepositoryAdapterTest {
    @Test
    fun `account deletion delegates consumed pending-row cleanup`() {
        val repository = mock(PendingOAuthSignupRepository::class.java)
        val adapter = PendingOAuthSignupRepositoryAdapter(repository)
        given(repository.deleteByMemberLoginId("KAKAO__member")).willReturn(1)

        assertThat(adapter.deleteByMemberLoginId("KAKAO__member")).isEqualTo(1)
        verify(repository).deleteByMemberLoginId("KAKAO__member")
    }
}
