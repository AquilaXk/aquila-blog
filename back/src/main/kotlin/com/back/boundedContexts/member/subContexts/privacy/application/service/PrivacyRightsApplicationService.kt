package com.back.boundedContexts.member.subContexts.privacy.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.subContexts.legalAcceptance.adapter.persistence.MemberLegalAcceptanceRepository
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberAccountDeletionRepository
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberPrivacyRequestRepository
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.global.exception.application.AppException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class PrivacyRightsApplicationService(
    private val memberUseCase: MemberUseCase,
    private val memberRepository: MemberRepositoryPort,
    private val memberPrivacyRequestRepository: MemberPrivacyRequestRepository,
    private val memberAccountDeletionRepository: MemberAccountDeletionRepository,
    private val memberLegalAcceptanceRepository: MemberLegalAcceptanceRepository,
    private val memberSessionUseCase: MemberSessionUseCase,
) {
    @Transactional(readOnly = true)
    fun exportFor(memberId: Long): PrivacyExportResponse {
        val member =
            memberRepository
                .findById(memberId)
                .orElseThrow { AppException("404-1", "회원을 찾을 수 없습니다.") }
        val legalAcceptance = memberLegalAcceptanceRepository.findTopByMemberIdOrderByAcceptedAtDesc(memberId)

        return PrivacyExportResponse(
            generatedAt = Instant.now(),
            member =
                PrivacyExportMemberSnapshot(
                    id = member.id,
                    email = member.email,
                    username = member.username,
                    nickname = member.nickname,
                    createdAt = member.createdAt,
                    modifiedAt = member.modifiedAt,
                ),
            latestLegalAcceptance =
                legalAcceptance?.let {
                    PrivacyLegalAcceptanceSnapshot(
                        termsVersion = it.termsVersion,
                        termsContentSha256 = it.termsContentSha256,
                        privacyVersion = it.privacyVersion,
                        privacyContentSha256 = it.privacyContentSha256,
                        age14OrOlder = it.age14OrOlder,
                        requiredPrivacyConfirmed = it.requiredPrivacyConfirmed,
                        analyticsConsent = it.analyticsConsent,
                        overseasTransferAcknowledged = it.overseasTransferAcknowledged,
                        source = it.source,
                        acceptedAt = it.acceptedAt,
                    )
                },
        )
    }

    @Transactional
    fun createRequest(
        memberId: Long,
        type: MemberPrivacyRequestType,
        message: String?,
    ): PrivacyRequestDto {
        val member = memberRepository.getReferenceById(memberId)
        val requestedAt = Instant.now()
        val request =
            memberPrivacyRequestRepository.save(
                MemberPrivacyRequest(
                    member = member,
                    type = type,
                    message = message?.trim()?.takeIf { it.isNotBlank() },
                    requestedAt = requestedAt,
                    dueAt = requestedAt.plus(30, ChronoUnit.DAYS),
                ),
            )

        return PrivacyRequestDto(request)
    }

    @Transactional(readOnly = true)
    fun getRequest(
        memberId: Long,
        requestId: Long,
    ): PrivacyRequestDto {
        val request =
            memberPrivacyRequestRepository.findByIdAndMemberId(requestId, memberId)
                ?: throw AppException("404-1", "개인정보 처리 요청을 찾을 수 없습니다.")

        return PrivacyRequestDto(request)
    }

    @Transactional
    fun deleteAccount(
        memberId: Long,
        password: String,
        reason: String?,
    ): AccountDeletionResult {
        val member =
            memberRepository
                .findById(memberId)
                .orElseThrow { AppException("404-1", "회원을 찾을 수 없습니다.") }

        memberUseCase.checkPassword(member, password)

        if (memberAccountDeletionRepository.existsByMemberId(member.id)) {
            throw AppException("409-1", "이미 탈퇴 처리된 계정입니다.")
        }

        val deletedAt = Instant.now()
        member.softDelete(deletedAt)
        memberAccountDeletionRepository.save(
            MemberAccountDeletion(
                member = member,
                reason = reason?.trim()?.takeIf { it.isNotBlank() },
                deletedAt = deletedAt,
            ),
        )
        val revokedSessionCount = memberSessionUseCase.revokeAllActiveSessionsForMember(member.id)

        return AccountDeletionResult(
            memberId = member.id,
            deletedAt = deletedAt,
            revokedSessionCount = revokedSessionCount,
        )
    }
}

data class PrivacyExportResponse(
    val generatedAt: Instant,
    val member: PrivacyExportMemberSnapshot,
    val latestLegalAcceptance: PrivacyLegalAcceptanceSnapshot?,
)

data class PrivacyExportMemberSnapshot(
    val id: Long,
    val email: String?,
    val username: String,
    val nickname: String,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

data class PrivacyLegalAcceptanceSnapshot(
    val termsVersion: String,
    val termsContentSha256: String,
    val privacyVersion: String,
    val privacyContentSha256: String,
    val age14OrOlder: Boolean,
    val requiredPrivacyConfirmed: Boolean,
    val analyticsConsent: Boolean,
    val overseasTransferAcknowledged: Boolean,
    val source: String,
    val acceptedAt: Instant,
)

data class PrivacyRequestDto(
    val id: Long,
    val memberId: Long,
    val type: MemberPrivacyRequestType,
    val status: MemberPrivacyRequestStatus,
    val message: String?,
    val requestedAt: Instant,
    val dueAt: Instant,
    val completedAt: Instant?,
) {
    constructor(request: MemberPrivacyRequest) : this(
        id = request.id,
        memberId = request.member.id,
        type = request.type,
        status = request.status,
        message = request.message,
        requestedAt = request.requestedAt,
        dueAt = request.dueAt,
        completedAt = request.completedAt,
    )
}

data class AccountDeletionResult(
    val memberId: Long,
    val deletedAt: Instant,
    val revokedSessionCount: Int,
)
