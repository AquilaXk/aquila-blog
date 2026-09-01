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
import com.back.boundedContexts.member.domain.shared.memberMixin.decodeMemberProfileWorkspaceContent
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberAccountDeletionRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestAuditRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.PrivacyCanonicalExportReadPort
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.PrivacyExportPublicPostRecord
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.PrivacyExportRequestRecord
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.PrivacyExportSessionRecord
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAudit
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAuditAction
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestHoldStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIdentityStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIntakeChannel
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestRequesterRole
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.boundedContexts.member.subContexts.session.application.port.input.MemberSessionUseCase
import com.back.boundedContexts.post.application.port.input.PostUseCase
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.storage.application.UploadedFileRetentionService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat
import java.util.UUID

@Service
class PrivacyRightsApplicationService(
    private val memberUseCase: MemberUseCase,
    private val memberRepository: MemberRepositoryPort,
    private val memberAttrRepository: MemberAttrRepositoryPort,
    private val memberPrivacyRequestRepository: MemberPrivacyRequestRepositoryPort,
    private val memberPrivacyRequestAuditRepository: MemberPrivacyRequestAuditRepositoryPort,
    private val memberAccountDeletionRepository: MemberAccountDeletionRepositoryPort,
    private val privacyCanonicalExportReadPort: PrivacyCanonicalExportReadPort,
    private val memberSessionUseCase: MemberSessionUseCase,
    private val oauthSignupUseCase: OAuthSignupUseCase,
    private val postUseCase: PostUseCase,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
    private val objectMapper: ObjectMapper,
) {
    private val logger = LoggerFactory.getLogger(PrivacyRightsApplicationService::class.java)

    @Transactional(readOnly = true)
    fun exportFor(memberId: Long): PrivacyExportResponse = buildCanonicalExport(memberId, Instant.now())

    @Transactional
    fun createOperatorEmailRequest(
        operationId: UUID,
        adminId: Long,
        type: MemberPrivacyRequestType,
        requesterContact: String,
        message: String?,
    ): OperatorPrivacyRequestDto {
        val normalizedContact = requesterContact.trim()
        val normalizedMessage = message?.trim()?.takeIf(String::isNotBlank)
        if (normalizedContact.isBlank() || normalizedContact.length > 320) {
            throw AppException(ErrorCode.BAD_REQUEST, "요청자 연락처가 올바르지 않습니다.")
        }

        replayedRequest(
            operationId = operationId,
            adminId = adminId,
            action = MemberPrivacyRequestAuditAction.REQUEST_CREATED,
            decision = null,
        )?.let { request ->
            if (
                request.type != type ||
                request.intakeChannel != MemberPrivacyRequestIntakeChannel.EMAIL ||
                request.requesterContact != normalizedContact ||
                request.message != normalizedMessage
            ) {
                throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT, "operationId 충돌")
            }
            return OperatorPrivacyRequestDto(request)
        }

        val now = Instant.now()
        val request =
            memberPrivacyRequestRepository.save(
                MemberPrivacyRequest(
                    type = type,
                    intakeChannel = MemberPrivacyRequestIntakeChannel.EMAIL,
                    identityStatus = MemberPrivacyRequestIdentityStatus.IDENTITY_PENDING,
                    requesterContact = normalizedContact,
                    assignedOwnerId = adminId,
                    requestedAt = now,
                    dueAt = now.plus(10, ChronoUnit.DAYS),
                    message = normalizedMessage,
                ),
            )
        recordAudit(request, operationId, adminId, MemberPrivacyRequestAuditAction.REQUEST_CREATED, now)
        return OperatorPrivacyRequestDto(request)
    }

    @Transactional(readOnly = true)
    fun operatorRequests(): List<OperatorPrivacyRequestDto> =
        memberPrivacyRequestRepository.findAllByOrderByRequestedAtDescIdDesc().map(::OperatorPrivacyRequestDto)

    @Transactional(readOnly = true)
    fun operatorRequest(requestId: Long): OperatorPrivacyRequestDto = OperatorPrivacyRequestDto(findOperatorRequest(requestId))

    @Transactional
    fun decideIdentity(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
        approved: Boolean,
        requesterRole: MemberPrivacyRequestRequesterRole?,
        memberId: Long?,
        accountDeletionId: Long?,
    ): OperatorPrivacyRequestDto =
        mutate(
            requestId = requestId,
            operationId = operationId,
            adminId = adminId,
            action = MemberPrivacyRequestAuditAction.IDENTITY_REVIEWED,
            decision = if (approved) "APPROVED" else "REJECTED",
        ) { request, now ->
            if (!approved) {
                if (memberId != null || accountDeletionId != null) {
                    throw AppException(ErrorCode.BAD_REQUEST, "거절 결정에는 대상 링크를 지정할 수 없습니다.")
                }
                request.rejectIdentity(now)
                return@mutate
            }

            if ((memberId == null) == (accountDeletionId == null)) {
                throw AppException(ErrorCode.BAD_REQUEST, "대상 링크는 정확히 하나여야 합니다.")
            }
            val role = requesterRole ?: throw AppException(ErrorCode.BAD_REQUEST, "요청자 역할이 필요합니다.")
            val member =
                memberId?.let {
                    memberRepository
                        .findById(it)
                        .filter { candidate -> candidate.deletedAt == null }
                        .orElseThrow { AppException(ErrorCode.NOT_FOUND, "활성 회원을 찾을 수 없습니다.") }
                }
            if (accountDeletionId != null && !memberAccountDeletionRepository.existsById(accountDeletionId)) {
                throw AppException(ErrorCode.NOT_FOUND, "탈퇴 기록을 찾을 수 없습니다.")
            }
            request.approveManualIdentity(member, accountDeletionId, role, adminId, now)
        }

    @Transactional
    fun decideHold(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
        status: MemberPrivacyRequestHoldStatus,
        scope: String?,
        reason: String?,
        releaseDecision: String?,
    ): OperatorPrivacyRequestDto =
        mutate(
            requestId = requestId,
            operationId = operationId,
            adminId = adminId,
            action =
                if (status == MemberPrivacyRequestHoldStatus.RELEASED) {
                    MemberPrivacyRequestAuditAction.HOLD_RELEASED
                } else {
                    MemberPrivacyRequestAuditAction.HOLD_REVIEWED
                },
            decision = status.name,
        ) { request, now ->
            request.decideHold(status, scope, reason, adminId, now, releaseDecision)
        }

    @Transactional
    fun decideStepUp(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
        approved: Boolean,
    ): OperatorPrivacyRequestDto =
        mutate(
            requestId = requestId,
            operationId = operationId,
            adminId = adminId,
            action =
                if (approved) {
                    MemberPrivacyRequestAuditAction.STEP_UP_VERIFIED
                } else {
                    MemberPrivacyRequestAuditAction.STEP_UP_REJECTED
                },
            decision = if (approved) "APPROVED" else "REJECTED",
        ) { request, now ->
            request.recordStepUp(adminId, now, approved)
        }

    @Transactional
    fun decideRequest(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
        status: MemberPrivacyRequestStatus,
    ): OperatorPrivacyRequestDto =
        mutate(
            requestId = requestId,
            operationId = operationId,
            adminId = adminId,
            action =
                if (status == MemberPrivacyRequestStatus.COMPLETED) {
                    MemberPrivacyRequestAuditAction.REQUEST_COMPLETED
                } else {
                    MemberPrivacyRequestAuditAction.REQUEST_REJECTED
                },
            decision = status.name,
        ) { request, now ->
            if (status == MemberPrivacyRequestStatus.COMPLETED) {
                requireFulfillmentRecorded(request)
            }
            request.decide(status, now)
        }

    private fun requireFulfillmentRecorded(request: MemberPrivacyRequest) {
        val requiredAction =
            when (request.type) {
                MemberPrivacyRequestType.EXPORT -> MemberPrivacyRequestAuditAction.EXPORT_GENERATED
                MemberPrivacyRequestType.DELETION -> MemberPrivacyRequestAuditAction.DELETION_COMPLETED
                else -> return
            }
        if (!memberPrivacyRequestAuditRepository.existsByRequestIdAndAction(request.id, requiredAction)) {
            throw AppException(ErrorCode.BAD_REQUEST, "요청 이행 기록이 없습니다.")
        }
    }

    private fun mutate(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
        action: MemberPrivacyRequestAuditAction,
        decision: String,
        apply: (MemberPrivacyRequest, Instant) -> Unit,
    ): OperatorPrivacyRequestDto {
        replayedRequest(operationId, adminId, action, decision)?.let { request ->
            if (request.id != requestId) {
                throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT, "operationId 충돌")
            }
            return OperatorPrivacyRequestDto(request)
        }

        val request =
            memberPrivacyRequestRepository
                .findByIdForUpdate(requestId)
                .orElseThrow { AppException(ErrorCode.NOT_FOUND, "개인정보 처리 요청을 찾을 수 없습니다.") }
        val now = Instant.now()
        try {
            apply(request, now)
        } catch (exception: IllegalArgumentException) {
            throw AppException(ErrorCode.BAD_REQUEST, "요청이 올바르지 않습니다.")
        }
        recordAudit(request, operationId, adminId, action, now, decision)
        return OperatorPrivacyRequestDto(request)
    }

    private fun replayedRequest(
        operationId: UUID,
        adminId: Long,
        action: MemberPrivacyRequestAuditAction,
        decision: String?,
    ): MemberPrivacyRequest? =
        replayedAudit(operationId, adminId, action, decision)?.let { audit ->
            findOperatorRequest(audit.requestId)
        }

    private fun replayedAudit(
        operationId: UUID,
        adminId: Long,
        action: MemberPrivacyRequestAuditAction,
        decision: String?,
    ): MemberPrivacyRequestAudit? {
        val audit = memberPrivacyRequestAuditRepository.findByOperationId(operationId) ?: return null
        if (audit.actorMemberId != adminId || audit.action != action || audit.decision != decision) {
            throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT, "operationId 충돌")
        }
        return audit
    }

    private fun findOperatorRequest(requestId: Long): MemberPrivacyRequest =
        memberPrivacyRequestRepository
            .findById(requestId)
            .orElseThrow { AppException(ErrorCode.NOT_FOUND, "개인정보 처리 요청을 찾을 수 없습니다.") }

    private fun recordAudit(
        request: MemberPrivacyRequest,
        operationId: UUID,
        adminId: Long,
        action: MemberPrivacyRequestAuditAction,
        occurredAt: Instant,
        decision: String? = null,
        redactedRecordCount: Long = 0,
        evidenceSha256: String? = null,
    ) {
        memberPrivacyRequestAuditRepository.save(
            MemberPrivacyRequestAudit(
                requestId = request.id,
                operationId = operationId,
                actorMemberId = adminId,
                action = action,
                occurredAt = occurredAt,
                decision = decision,
                redactedRecordCount = redactedRecordCount,
                evidenceSha256 = evidenceSha256,
            ),
        )
    }

    @Transactional
    fun exportOperatorRequest(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
    ): OperatorPrivacyExportResult {
        replayedAudit(
            operationId = operationId,
            adminId = adminId,
            action = MemberPrivacyRequestAuditAction.EXPORT_GENERATED,
            decision = null,
        )?.let { audit ->
            if (audit.requestId != requestId) {
                throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT, "operationId 충돌")
            }
            val request = findOperatorRequest(requestId)
            requireExportReady(request)
            val export = buildCanonicalExport(resolveSubjectMemberId(request), audit.occurredAt)
            val evidenceSha256 = evidenceSha256(export)
            if (evidenceSha256 != audit.evidenceSha256) {
                throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT, "내보내기 대상 데이터가 변경되었습니다.")
            }
            return OperatorPrivacyExportResult(
                requestId = request.id,
                export = export,
                redactedRecordCount = audit.redactedRecordCount,
                evidenceSha256 = evidenceSha256,
            )
        }

        val request = findOperatorRequestForUpdate(requestId)
        requireExportReady(request)
        val generatedAt = Instant.now()
        val export = buildCanonicalExport(resolveSubjectMemberId(request), generatedAt)
        val recordCount = export.redactedRecordCount()
        val evidenceSha256 = evidenceSha256(export)
        recordAudit(
            request = request,
            operationId = operationId,
            adminId = adminId,
            action = MemberPrivacyRequestAuditAction.EXPORT_GENERATED,
            occurredAt = generatedAt,
            redactedRecordCount = recordCount,
            evidenceSha256 = evidenceSha256,
        )
        return OperatorPrivacyExportResult(request.id, export, recordCount, evidenceSha256)
    }

    @Transactional
    fun deleteForOperator(
        requestId: Long,
        operationId: UUID,
        adminId: Long,
        reason: String?,
    ): OperatorPrivacyDeletionResult {
        replayedAudit(
            operationId = operationId,
            adminId = adminId,
            action = MemberPrivacyRequestAuditAction.DELETION_COMPLETED,
            decision = null,
        )?.let { audit ->
            if (audit.requestId != requestId) {
                throw AppException(ErrorCode.ADMIN_OPERATION_CONFLICT, "operationId 충돌")
            }
            return OperatorPrivacyDeletionResult(
                request = OperatorPrivacyRequestDto(findOperatorRequest(requestId)),
                deletedAt = audit.occurredAt,
                redactedRecordCount = audit.redactedRecordCount,
                evidenceSha256 = requireNotNull(audit.evidenceSha256),
            )
        }

        val request = findOperatorRequestForUpdate(requestId)
        val member = requireDeletionReady(request)
        if (
            memberPrivacyRequestRepository.existsByMemberIdAndTypeAndStatusIn(
                memberId = member.id,
                type = MemberPrivacyRequestType.EXPORT,
                statuses = OPEN_REQUEST_STATUSES,
            )
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "완료되지 않은 개인정보 내보내기 요청이 있습니다.")
        }

        val publicPostCount = privacyCanonicalExportReadPort.countOwnedPublicContent(member.id)
        val performed = performAccountDeletion(member, reason, adminId)
        request.linkDeletionTombstone(performed.tombstone.id)
        val redactedRecordCount = 1L + performed.result.revokedSessionCount + publicPostCount
        val evidence =
            PrivacyDeletionEvidence(
                requestId = request.id,
                accountDeletionId = performed.tombstone.id,
                deletedAt = performed.result.deletedAt,
                revokedSessionCount = performed.result.revokedSessionCount,
                publicPostCount = publicPostCount,
            )
        val evidenceSha256 = evidenceSha256(evidence)
        recordAudit(
            request = request,
            operationId = operationId,
            adminId = adminId,
            action = MemberPrivacyRequestAuditAction.DELETION_COMPLETED,
            occurredAt = performed.result.deletedAt,
            redactedRecordCount = redactedRecordCount,
            evidenceSha256 = evidenceSha256,
        )
        return OperatorPrivacyDeletionResult(
            request = OperatorPrivacyRequestDto(request),
            deletedAt = performed.result.deletedAt,
            redactedRecordCount = redactedRecordCount,
            evidenceSha256 = evidenceSha256,
        )
    }

    private fun findOperatorRequestForUpdate(requestId: Long): MemberPrivacyRequest =
        memberPrivacyRequestRepository
            .findByIdForUpdate(requestId)
            .orElseThrow { AppException(ErrorCode.NOT_FOUND, "개인정보 처리 요청을 찾을 수 없습니다.") }

    private fun requireExportReady(request: MemberPrivacyRequest) {
        requireOperatorRequestOpenAndVerified(request)
        if (request.type != MemberPrivacyRequestType.EXPORT) {
            throw AppException(ErrorCode.BAD_REQUEST, "내보내기 요청이 아닙니다.")
        }
        requireStepUp(request)
    }

    private fun requireDeletionReady(request: MemberPrivacyRequest): Member {
        requireOperatorRequestOpenAndVerified(request)
        if (request.type != MemberPrivacyRequestType.DELETION) {
            throw AppException(ErrorCode.BAD_REQUEST, "삭제 요청이 아닙니다.")
        }
        requireStepUp(request)
        if (
            request.holdStatus == MemberPrivacyRequestHoldStatus.UNREVIEWED ||
            request.holdStatus == MemberPrivacyRequestHoldStatus.ACTIVE
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "보존 검토가 완료되지 않았습니다.")
        }
        return request.member ?: throw AppException(ErrorCode.BAD_REQUEST, "활성 회원 링크가 필요합니다.")
    }

    private fun requireOperatorRequestOpenAndVerified(request: MemberPrivacyRequest) {
        if (
            request.identityStatus != MemberPrivacyRequestIdentityStatus.VERIFIED_SESSION &&
            request.identityStatus != MemberPrivacyRequestIdentityStatus.VERIFIED_MANUAL
        ) {
            throw AppException(ErrorCode.BAD_REQUEST, "본인 확인이 완료되지 않았습니다.")
        }
        if (request.status == MemberPrivacyRequestStatus.COMPLETED || request.status == MemberPrivacyRequestStatus.REJECTED) {
            throw AppException(ErrorCode.BAD_REQUEST, "종료된 요청입니다.")
        }
    }

    private fun requireStepUp(request: MemberPrivacyRequest) {
        if (request.stepUpVerifiedById == null || request.stepUpVerifiedAt == null) {
            throw AppException(ErrorCode.BAD_REQUEST, "추가 확인이 완료되지 않았습니다.")
        }
    }

    private fun resolveSubjectMemberId(request: MemberPrivacyRequest): Long {
        request.member?.let { return it.id }
        val accountDeletionId =
            request.accountDeletionId
                ?: throw AppException(ErrorCode.BAD_REQUEST, "확인된 대상 링크가 필요합니다.")
        return memberAccountDeletionRepository
            .findById(accountDeletionId)
            .orElseThrow { AppException(ErrorCode.NOT_FOUND, "탈퇴 기록을 찾을 수 없습니다.") }
            .memberId
    }

    private fun buildCanonicalExport(
        memberId: Long,
        generatedAt: Instant,
    ): PrivacyExportResponse {
        val account =
            privacyCanonicalExportReadPort.findAccount(memberId)
                ?: throw AppException(ErrorCode.NOT_FOUND, "회원을 찾을 수 없습니다.")
        val legalAcceptance = privacyCanonicalExportReadPort.findLatestLegalAcceptance(memberId)
        val requestHistory = privacyCanonicalExportReadPort.findRequestHistory(memberId)
        val publicContent = privacyCanonicalExportReadPort.findOwnedPublicContent(memberId)
        val sessionSummary = privacyCanonicalExportReadPort.summarizeSessions(memberId)

        return PrivacyExportResponse(
            generatedAt = generatedAt,
            member =
                PrivacyExportMemberSnapshot(
                    id = account.id,
                    email = account.email,
                    username = account.username,
                    nickname = account.nickname,
                    createdAt = account.createdAt,
                    modifiedAt = account.modifiedAt,
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
            requestHistory = requestHistory.map(::PrivacyExportRequestSnapshot),
            ownedPublicContent = publicContent.map(::PrivacyExportPublicPostSnapshot),
            sessionSummary = PrivacyExportSessionSummary(sessionSummary),
        )
    }

    private fun evidenceSha256(value: Any): String =
        HexFormat.of().formatHex(
            MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(value)),
        )

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
                    dueAt = requestedAt.plus(10, ChronoUnit.DAYS),
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
                ?: throw AppException(ErrorCode.NOT_FOUND, "개인정보 처리 요청을 찾을 수 없습니다.")

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
                .orElseThrow { AppException(ErrorCode.NOT_FOUND, "회원을 찾을 수 없습니다.") }

        verifyAccountDeletionReauthentication(
            member = member,
            password = password,
            oauthAccountDeletionConfirmed = oauthAccountDeletionConfirmed,
        )

        return performAccountDeletion(member, reason, member.id).result
    }

    private fun performAccountDeletion(
        member: Member,
        reason: String?,
        actorId: Long,
    ): PerformedAccountDeletion {
        if (memberAccountDeletionRepository.existsByMemberId(member.id)) {
            throw AppException(ErrorCode.MEMBER_WITHDRAWN, "이미 탈퇴 처리된 계정입니다.")
        }

        val deletedAt = Instant.now()
        val originalMemberLoginId = member.username
        val profileImageUrlsForCleanup = collectProfileImageUrlsForCleanup(member)
        val revokedSessionCount = memberSessionUseCase.revokeAllActiveSessionsForMember(member.id)
        postUseCase.deleteContentByAuthorForAccountDeletion(member)
        oauthSignupUseCase.releaseConsumedSignupForMemberLoginId(originalMemberLoginId)
        member.softDelete(deletedAt)
        scheduleProfileImageCleanup(member.id, profileImageUrlsForCleanup)
        memberAttrRepository.clearStringValuesBySubjectIdAndNameIn(member.id, PROFILE_PRIVACY_ATTR_NAMES)
        val tombstone =
            memberAccountDeletionRepository.save(
                MemberAccountDeletion(
                    memberId = member.id,
                    reason = reason?.trim()?.takeIf { it.isNotBlank() },
                    deletedAt = deletedAt,
                ),
            )
        memberAccountDeletionRepository.flush()
        logger.info("member_withdraw_completed memberId={} actorId={}", member.id, actorId)

        return PerformedAccountDeletion(
            result =
                AccountDeletionResult(
                    memberId = member.id,
                    deletedAt = deletedAt,
                    revokedSessionCount = revokedSessionCount,
                ),
            tombstone = tombstone,
        )
    }

    private fun verifyAccountDeletionReauthentication(
        member: Member,
        password: String?,
        oauthAccountDeletionConfirmed: Boolean,
    ) {
        if (member.password.isNullOrBlank()) {
            if (!oauthAccountDeletionConfirmed) {
                throw AppException(ErrorCode.MEMBER_BAD_REQUEST, "소셜 계정 탈퇴 확인이 필요합니다.")
            }
            return
        }

        val rawPassword =
            password
                ?.takeIf { it.isNotBlank() }
                ?: throw AppException(ErrorCode.BAD_REQUEST, "비밀번호를 입력해주세요.")
        memberUseCase.checkPassword(member, rawPassword)
    }

    private fun collectProfileImageUrlsForCleanup(member: Member): List<String> {
        val attrs =
            memberAttrRepository
                .findBySubjectInAndNameIn(listOf(member), PROFILE_IMAGE_CLEANUP_ATTR_NAMES)
                .associateBy { it.name }

        return listOfNotNull(
            attrs[PROFILE_IMG_URL]?.strValue,
            attrs[PROFILE_WORKSPACE_DRAFT]?.strValue?.let(::decodeMemberProfileWorkspaceContent)?.profileImageUrl,
            attrs[PROFILE_WORKSPACE_PUBLISHED]?.strValue?.let(::decodeMemberProfileWorkspaceContent)?.profileImageUrl,
        ).map(String::trim)
            .filter(String::isNotBlank)
            .distinct()
    }

    private fun scheduleProfileImageCleanup(
        memberId: Long,
        profileImageUrls: List<String>,
    ) {
        profileImageUrls.forEach { profileImageUrl ->
            uploadedFileRetentionService.syncProfileImage(
                memberId = memberId,
                previousProfileImgUrl = profileImageUrl,
                currentProfileImgUrl = null,
            )
        }
    }

    companion object {
        private val OPEN_REQUEST_STATUSES =
            setOf(
                MemberPrivacyRequestStatus.RECEIVED,
                MemberPrivacyRequestStatus.IN_PROGRESS,
            )

        private val PROFILE_IMAGE_CLEANUP_ATTR_NAMES =
            listOf(
                PROFILE_IMG_URL,
                PROFILE_WORKSPACE_DRAFT,
                PROFILE_WORKSPACE_PUBLISHED,
            )

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
    val requestHistory: List<PrivacyExportRequestSnapshot>,
    val ownedPublicContent: List<PrivacyExportPublicPostSnapshot>,
    val sessionSummary: PrivacyExportSessionSummary,
) {
    fun redactedRecordCount(): Long =
        1L +
            (if (latestLegalAcceptance == null) 0 else 1) +
            requestHistory.size +
            ownedPublicContent.size +
            sessionSummary.totalCount
}

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

data class PrivacyExportRequestSnapshot(
    val id: Long,
    val type: MemberPrivacyRequestType,
    val status: MemberPrivacyRequestStatus,
    val intakeChannel: MemberPrivacyRequestIntakeChannel,
    val identityStatus: MemberPrivacyRequestIdentityStatus,
    val requesterRole: MemberPrivacyRequestRequesterRole,
    val holdStatus: MemberPrivacyRequestHoldStatus,
    val message: String?,
    val requestedAt: Instant,
    val dueAt: Instant,
    val completedAt: Instant?,
) {
    constructor(record: PrivacyExportRequestRecord) : this(
        id = record.id,
        type = record.type,
        status = record.status,
        intakeChannel = record.intakeChannel,
        identityStatus = record.identityStatus,
        requesterRole = record.requesterRole,
        holdStatus = record.holdStatus,
        message = record.message,
        requestedAt = record.requestedAt,
        dueAt = record.dueAt,
        completedAt = record.completedAt,
    )
}

data class PrivacyExportPublicPostSnapshot(
    val id: Long,
    val title: String,
    val content: String,
    val contentHtml: String?,
    val listed: Boolean,
    val createdAt: Instant,
    val modifiedAt: Instant,
) {
    constructor(record: PrivacyExportPublicPostRecord) : this(
        id = record.id,
        title = record.title,
        content = record.content,
        contentHtml = record.contentHtml,
        listed = record.listed,
        createdAt = record.createdAt,
        modifiedAt = record.modifiedAt,
    )
}

data class PrivacyExportSessionSummary(
    val totalCount: Long,
    val activeCount: Long,
    val firstCreatedAt: Instant?,
    val lastAuthenticatedAt: Instant?,
) {
    constructor(record: PrivacyExportSessionRecord) : this(
        totalCount = record.totalCount,
        activeCount = record.activeCount,
        firstCreatedAt = record.firstCreatedAt,
        lastAuthenticatedAt = record.lastAuthenticatedAt,
    )
}

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
        memberId = requireNotNull(request.member) { "Authenticated privacy response requires a linked member." }.id,
        type = request.type,
        status = request.status,
        message = request.message,
        requestedAt = request.requestedAt,
        dueAt = request.dueAt,
        completedAt = request.completedAt,
    )
}

data class OperatorPrivacyRequestDto(
    val id: Long,
    val memberId: Long?,
    val accountDeletionId: Long?,
    val type: MemberPrivacyRequestType,
    val status: MemberPrivacyRequestStatus,
    val intakeChannel: MemberPrivacyRequestIntakeChannel,
    val identityStatus: MemberPrivacyRequestIdentityStatus,
    val requesterRole: MemberPrivacyRequestRequesterRole,
    val requesterContact: String?,
    val assignedOwnerId: Long?,
    val identityVerifiedById: Long?,
    val identityVerifiedAt: Instant?,
    val stepUpVerifiedById: Long?,
    val stepUpVerifiedAt: Instant?,
    val holdStatus: MemberPrivacyRequestHoldStatus,
    val holdScope: String?,
    val holdReason: String?,
    val holdReviewedById: Long?,
    val holdReviewedAt: Instant?,
    val holdReleasedAt: Instant?,
    val holdReleaseDecision: String?,
    val message: String?,
    val requestedAt: Instant,
    val dueAt: Instant,
    val completedAt: Instant?,
) {
    constructor(request: MemberPrivacyRequest) : this(
        id = request.id,
        memberId = request.member?.id,
        accountDeletionId = request.accountDeletionId,
        type = request.type,
        status = request.status,
        intakeChannel = request.intakeChannel,
        identityStatus = request.identityStatus,
        requesterRole = request.requesterRole,
        requesterContact = request.requesterContact,
        assignedOwnerId = request.assignedOwnerId,
        identityVerifiedById = request.identityVerifiedById,
        identityVerifiedAt = request.identityVerifiedAt,
        stepUpVerifiedById = request.stepUpVerifiedById,
        stepUpVerifiedAt = request.stepUpVerifiedAt,
        holdStatus = request.holdStatus,
        holdScope = request.holdScope,
        holdReason = request.holdReason,
        holdReviewedById = request.holdReviewedById,
        holdReviewedAt = request.holdReviewedAt,
        holdReleasedAt = request.holdReleasedAt,
        holdReleaseDecision = request.holdReleaseDecision,
        message = request.message,
        requestedAt = request.requestedAt,
        dueAt = request.dueAt,
        completedAt = request.completedAt,
    )
}

data class OperatorPrivacyExportResult(
    val requestId: Long,
    val export: PrivacyExportResponse,
    val redactedRecordCount: Long,
    val evidenceSha256: String,
)

data class OperatorPrivacyDeletionResult(
    val request: OperatorPrivacyRequestDto,
    val deletedAt: Instant,
    val redactedRecordCount: Long,
    val evidenceSha256: String,
)

data class AccountDeletionResult(
    val memberId: Long,
    val deletedAt: Instant,
    val revokedSessionCount: Int,
)

private data class PerformedAccountDeletion(
    val result: AccountDeletionResult,
    val tombstone: MemberAccountDeletion,
)

private data class PrivacyDeletionEvidence(
    val requestId: Long,
    val accountDeletionId: Long,
    val deletedAt: Instant,
    val revokedSessionCount: Int,
    val publicPostCount: Long,
)
