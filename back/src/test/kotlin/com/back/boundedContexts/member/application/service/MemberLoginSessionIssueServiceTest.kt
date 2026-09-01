package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.AuthTokenIssueUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.app.AdminProperties
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import java.util.Optional

class MemberLoginSessionIssueServiceTest {
    @Test
    fun `session issue rejects a non-canonical locked identity before creating credentials`() {
        val member =
            Member(
                id = 42,
                username = "other-admin",
                password = null,
                nickname = "관리자",
                email = "other-admin@test.com",
                apiKey = "existing-api-key",
            )
        val memberRepository = mock(MemberRepositoryPort::class.java)
        val memberApplicationService = mock(MemberApplicationService::class.java)
        val memberSessionUseCase = mock(MemberSessionUseCase::class.java)
        val authTokenIssueUseCase = mock(AuthTokenIssueUseCase::class.java)
        val service =
            MemberLoginSessionIssueService(
                memberRepository = memberRepository,
                memberApplicationService = memberApplicationService,
                memberSessionUseCase = memberSessionUseCase,
                authTokenIssueUseCase = authTokenIssueUseCase,
                canonicalAdminPolicy = CanonicalAdminPolicy(AdminProperties(email = "admin@test.com")),
            )

        `when`(memberApplicationService.ensureVerifiedEmailIdentity("admin@test.com", "관리자")).thenReturn(member)
        `when`(memberRepository.findByIdForUpdate(member.id)).thenReturn(Optional.of(member))

        assertThatThrownBy {
            service.issueAdminEmail(
                email = "admin@test.com",
                nickname = "관리자",
                rememberLoginEnabled = true,
                createdIp = "203.0.113.7",
                userAgent = "member-session-unit-test",
            )
        }.isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.UNAUTHORIZED)
        verifyNoInteractions(memberSessionUseCase, authTokenIssueUseCase)
    }
}
