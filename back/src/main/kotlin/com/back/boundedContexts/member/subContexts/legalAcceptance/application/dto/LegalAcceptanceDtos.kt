package com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto

import java.time.Instant

data class LegalAcceptanceCommand(
    val termsVersion: String,
    val termsContentSha256: String,
    val privacyVersion: String,
    val privacyContentSha256: String,
    val age14OrOlder: Boolean,
    val requiredPrivacyConfirmed: Boolean,
    val analyticsConsent: Boolean,
    val overseasTransferAcknowledged: Boolean,
)

data class LegalReconsentStatus(
    val status: String,
    val required: Boolean,
    val termsVersion: String,
    val termsContentSha256: String,
    val privacyVersion: String,
    val privacyContentSha256: String,
    val acceptedAt: Instant?,
    val refusalGuidePath: String = "/settings/privacy",
    val exportGuidePath: String = "/settings/privacy",
    val deletionGuidePath: String = "/settings/account",
)

data class LegalReconsentReport(
    val currentAcceptedMembers: Long,
    val reconsentRequiredMembers: Long,
) {
    val totalMembers: Long = currentAcceptedMembers + reconsentRequiredMembers
    val completionRate: Double =
        if (totalMembers == 0L) {
            1.0
        } else {
            currentAcceptedMembers.toDouble() / totalMembers.toDouble()
        }
}
