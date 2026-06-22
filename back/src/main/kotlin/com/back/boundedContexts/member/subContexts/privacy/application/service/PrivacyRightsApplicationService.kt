package com.back.boundedContexts.member.subContexts.privacy.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_DETAILS
import com.back.boundedContexts.member.domain.shared.memberMixin.ABOUT_ROLE
import com.back.boundedContexts.member.domain.shared.memberMixin.BLOG_TITLE
import com.back.boundedContexts.member.domain.shared.memberMixin.HOME_INTRO_DESCRIPTION
import com.back.boundedContexts.member.domain.shared.memberMixin.HOME_INTRO_TITLE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_BIO
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_LINKS
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_IMG_URL
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_ROLE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_LINKS
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_DRAFT
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_WORKSPACE_PUBLISHED
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.port.output.MemberLegalAcceptanceRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberAccountDeletionRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.application.port.output.PostCommentRepositoryPort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.global.exception.application.AppException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.temporal.ChronoUnit

@Service
class PrivacyRightsApplicationService(
    private val memberUseCase: MemberUseCase,
    private val memberRepository: MemberRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val memberPrivacyRequestRepository: MemberPrivacyRequestRepositoryPort,
    private val memberAccountDeletionRepository: MemberAccountDeletionRepositoryPort,
    private val memberLegalAcceptanceRepository: MemberLegalAcceptanceRepositoryPort,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val postRepository: PostRepositoryPort,
    private val postCommentRepository: PostCommentRepositoryPort,
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
        password: String?,
        oauthAccountDeletionConfirmed: Boolean,
        reason: String?,
    ): AccountDeletionResult {
        val member =
            memberRepository
                .findByIdForUpdate(memberId)
                .orElseThrow { AppException("404-1", "회원을 찾을 수 없습니다.") }

        verifyAccountDeletionReauthentication(
            member = member,
            password = password,
            oauthAccountDeletionConfirmed = oauthAccountDeletionConfirmed,
        )

        if (memberAccountDeletionRepository.existsByMemberId(member.id)) {
            throw AppException("409-1", "이미 탈퇴 처리된 계정입니다.")
        }

        val deletedAt = Instant.now()
        postCommentRepository.softDeleteByAuthorId(member.id)
        postRepository.softDeleteByAuthorId(member.id)
        member.softDelete(deletedAt)
        memberAttrRepository.clearStringValuesBySubjectIdAndNameIn(member.id, PROFILE_PRIVACY_ATTR_NAMES)
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

    private fun verifyAccountDeletionReauthentication(
        member: Member,
        password: String?,
        oauthAccountDeletionConfirmed: Boolean,
    ) {
        if (member.password.isNullOrBlank()) {
            if (!oauthAccountDeletionConfirmed) {
                throw AppException("400-2", "소셜 계정 탈퇴 확인이 필요합니다.")
            }
            return
        }

        val rawPassword =
            password
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: throw AppException("400-1", "비밀번호를 입력해주세요.")
        memberUseCase.checkPassword(member, rawPassword)
    }

    companion object {
        private val PROFILE_PRIVACY_ATTR_NAMES =
            listOf(
                PROFILE_IMG_URL,
                PROFILE_ROLE,
                PROFILE_BIO,
                ABOUT_ROLE,
                ABOUT_BIO,
                ABOUT_DETAILS,
                BLOG_TITLE,
                HOME_INTRO_TITLE,
                HOME_INTRO_DESCRIPTION,
                PROFILE_SERVICE_LINKS,
                PROFILE_CONTACT_LINKS,
                PROFILE_WORKSPACE_DRAFT,
                PROFILE_WORKSPACE_PUBLISHED,
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
