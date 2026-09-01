package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.application.port.output.MemberPrivacyRequestAuditRepositoryPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAudit
import org.springframework.data.jpa.repository.JpaRepository

interface MemberPrivacyRequestAuditRepository :
    JpaRepository<MemberPrivacyRequestAudit, Long>,
    MemberPrivacyRequestAuditRepositoryPort
