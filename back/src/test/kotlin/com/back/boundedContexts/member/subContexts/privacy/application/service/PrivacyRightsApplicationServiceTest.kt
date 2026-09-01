package com.back.boundedContexts.member.subContexts.privacy.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberAccountDeletionRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestAuditRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.PrivacyCanonicalExportReadPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIdentityStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIntakeChannel
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.UploadedFileRetentionService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Optional
import java.util.UUID

class PrivacyRightsApplicationServiceTest {
    private val requestRepository = mock(MemberPrivacyRequestRepositoryPort::class.java)
    private val auditRepository = mock(MemberPrivacyRequestAuditRepositoryPort::class.java)
    private val accountDeletionRepository = mock(MemberAccountDeletionRepositoryPort::class.java)
    private val exportReadPort = mock(PrivacyCanonicalExportReadPort::class.java)
    private val service =
        PrivacyRightsApplicationService(
            memberUseCase = mock(MemberUseCase::class.java),
            memberRepository = mock(MemberRepositoryPort::class.java),
            memberAttrRepository = mock(MemberAttrRepositoryPort::class.java),
            memberPrivacyRequestRepository = requestRepository,
            memberPrivacyRequestAuditRepository = auditRepository,
            memberAccountDeletionRepository = accountDeletionRepository,
            privacyCanonicalExportReadPort = exportReadPort,
            memberSessionUseCase = mock(MemberSessionUseCase::class.java),
            oauthSignupUseCase = mock(OAuthSignupUseCase::class.java),
            postUseCase = mock(PostUseCase::class.java),
            uploadedFileRetentionService = mock(UploadedFileRetentionService::class.java),
            objectMapper = jacksonObjectMapper(),
        )

    @Test
    fun `email intake rejects a normalized blank contact before persistence`() {
        val exception =
            assertThrows<AppException> {
                service.createOperatorEmailRequest(
                    operationId = UUID.randomUUID(),
                    adminId = 1,
                    type = MemberPrivacyRequestType.EXPORT,
                    requesterContact = "   ",
                    message = null,
                )
            }

        assertThat(exception.errorCode).isEqualTo(ErrorCode.BAD_REQUEST)
        verifyNoInteractions(requestRepository, auditRepository)
    }

    @Test
    fun `operator export rejects a verified request without a subject link`() {
        val request = verifiedExportRequest(id = 11)
        stubRequest(request)

        val exception =
            assertThrows<AppException> {
                service.exportOperatorRequest(request.id, UUID.randomUUID(), 1)
            }

        assertThat(exception.errorCode).isEqualTo(ErrorCode.BAD_REQUEST)
        verifyNoInteractions(exportReadPort)
    }

    @Test
    fun `operator export rejects a missing deletion tombstone`() {
        val request = verifiedExportRequest(id = 12, accountDeletionId = 91)
        stubRequest(request)
        `when`(accountDeletionRepository.findById(91)).thenReturn(Optional.empty())

        val exception =
            assertThrows<AppException> {
                service.exportOperatorRequest(request.id, UUID.randomUUID(), 1)
            }

        assertThat(exception.errorCode).isEqualTo(ErrorCode.NOT_FOUND)
        verifyNoInteractions(exportReadPort)
    }

    @Test
    fun `operator export rejects a subject missing from the canonical read port`() {
        val member = Member(id = 42, username = "privacy-subject", nickname = "Privacy subject", apiKey = "api-key")
        val request = verifiedExportRequest(id = 13, member = member)
        stubRequest(request)
        `when`(exportReadPort.findAccount(member.id)).thenReturn(null)

        val exception =
            assertThrows<AppException> {
                service.exportOperatorRequest(request.id, UUID.randomUUID(), 1)
            }

        assertThat(exception.errorCode).isEqualTo(ErrorCode.NOT_FOUND)
    }

    private fun stubRequest(request: MemberPrivacyRequest) {
        `when`(requestRepository.findByIdForUpdate(request.id)).thenReturn(Optional.of(request))
    }

    private fun verifiedExportRequest(
        id: Long,
        member: Member? = null,
        accountDeletionId: Long? = null,
    ): MemberPrivacyRequest {
        val requestedAt = Instant.parse("2026-09-01T00:00:00Z")
        return MemberPrivacyRequest(
            id = id,
            member = member,
            accountDeletionId = accountDeletionId,
            type = MemberPrivacyRequestType.EXPORT,
            status = MemberPrivacyRequestStatus.IN_PROGRESS,
            intakeChannel = MemberPrivacyRequestIntakeChannel.EMAIL,
            identityStatus = MemberPrivacyRequestIdentityStatus.VERIFIED_MANUAL,
            requesterContact = "privacy@example.com",
            assignedOwnerId = 1,
            identityVerifiedById = 1,
            identityVerifiedAt = requestedAt,
            stepUpVerifiedById = 1,
            stepUpVerifiedAt = requestedAt,
            requestedAt = requestedAt,
            dueAt = requestedAt.plus(10, ChronoUnit.DAYS),
        )
    }
}
