package com.back.boundedContexts.member.subContexts.oauthSignup.application.service

import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.output.PendingOAuthSignupRepositoryPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify

class OAuthSignupApplicationServiceTest {
    private val pendingRepository = mock(PendingOAuthSignupRepositoryPort::class.java)
    private val hashService = OAuthSignupHashService("oauth-secret", "signup-secret", "jwt-secret")
    private val service = OAuthSignupApplicationService(pendingRepository, hashService)

    @Test
    fun `existing OAuth identity helpers expose the canonical hash contract`() {
        val providerSubjectHash = service.providerSubjectHash(" kakao ", " provider-subject ")

        assertThat(providerSubjectHash)
            .isEqualTo(hashService.providerSubjectHash("KAKAO", "provider-subject"))
        assertThat(service.memberLoginId(" kakao ", providerSubjectHash))
            .isEqualTo(hashService.memberLoginId("KAKAO", providerSubjectHash))
    }

    @Test
    fun `account deletion releases only consumed pending rows through the retention port`() {
        given(pendingRepository.deleteByMemberLoginId("KAKAO__member")).willReturn(1)

        assertThat(service.releaseConsumedSignupForMemberLoginId("KAKAO__member")).isEqualTo(1)
        verify(pendingRepository).deleteByMemberLoginId("KAKAO__member")
    }
}
