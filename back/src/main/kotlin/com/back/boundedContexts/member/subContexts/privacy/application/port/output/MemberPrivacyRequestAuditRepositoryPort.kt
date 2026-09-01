package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAudit
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAuditAction
import java.util.UUID

interface MemberPrivacyRequestAuditRepositoryPort {
    fun save(memberPrivacyRequestAudit: MemberPrivacyRequestAudit): MemberPrivacyRequestAudit

    fun findByOperationId(operationId: UUID): MemberPrivacyRequestAudit?

    fun existsByRequestIdAndAction(
        requestId: Long,
        action: MemberPrivacyRequestAuditAction,
    ): Boolean
}
