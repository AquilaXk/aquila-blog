package com.back.boundedContexts.member.subContexts.privacy.application.dto

import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestHoldStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIdentityStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIntakeChannel
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestRequesterRole
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import java.time.Instant

data class PrivacyExportAccountRecord(
    val id: Long,
    val email: String?,
    val username: String,
    val nickname: String,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

data class PrivacyExportLegalAcceptanceRecord(
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

data class PrivacyExportRequestRecord(
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
)

data class PrivacyExportPublicPostRecord(
    val id: Long,
    val title: String,
    val content: String,
    val contentHtml: String?,
    val listed: Boolean,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

data class PrivacyExportSessionRecord(
    val totalCount: Long,
    val activeCount: Long,
    val firstCreatedAt: Instant?,
    val lastAuthenticatedAt: Instant?,
)
