package com.back.boundedContexts.member.subContexts.signupVerification.adapter.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import java.time.Instant

class MemberSignupVerificationRepositoryAdapterTest {
    @Test
    fun `retention delete clamps the batch size to repository bounds`() {
        val repository = mock(MemberSignupVerificationRepository::class.java)
        val adapter = MemberSignupVerificationRepositoryAdapter(repository)
        val cutoff = Instant.parse("2026-08-28T00:00:00Z")
        given(repository.deleteRetainedBefore(cutoff, 1)).willReturn(1)
        given(repository.deleteRetainedBefore(cutoff, 1_000)).willReturn(2)

        assertThat(adapter.deleteRetainedBefore(cutoff, 0)).isEqualTo(1)
        assertThat(adapter.deleteRetainedBefore(cutoff, 1_001)).isEqualTo(2)
        verify(repository).deleteRetainedBefore(cutoff, 1)
        verify(repository).deleteRetainedBefore(cutoff, 1_000)
    }
}
