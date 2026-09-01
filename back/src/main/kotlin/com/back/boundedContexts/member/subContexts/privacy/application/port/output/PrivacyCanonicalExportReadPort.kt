package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportAccountRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportLegalAcceptanceRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportPublicPostRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportRequestRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportSessionRecord

interface PrivacyCanonicalExportReadPort {
    fun findAccount(memberId: Long): PrivacyExportAccountRecord?

    fun findLatestLegalAcceptance(memberId: Long): PrivacyExportLegalAcceptanceRecord?

    fun findRequestHistory(memberId: Long): List<PrivacyExportRequestRecord>

    fun findOwnedPublicContent(memberId: Long): List<PrivacyExportPublicPostRecord>

    fun countOwnedPublicContent(memberId: Long): Long

    fun summarizeSessions(memberId: Long): PrivacyExportSessionRecord
}
