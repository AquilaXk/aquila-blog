package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestAuditRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAudit
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAuditAction
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface MemberPrivacyRequestAuditRepository :
    JpaRepository<MemberPrivacyRequestAudit, Long>,
    MemberPrivacyRequestAuditRepositoryPort {
    override fun findByOperationId(operationId: UUID): MemberPrivacyRequestAudit?

    override fun existsByRequestIdAndAction(
        requestId: Long,
        action: MemberPrivacyRequestAuditAction,
    ): Boolean
}
