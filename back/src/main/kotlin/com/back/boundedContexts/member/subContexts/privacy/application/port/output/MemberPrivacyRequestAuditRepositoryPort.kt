package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestAudit

interface MemberPrivacyRequestAuditRepositoryPort {
    fun save(memberPrivacyRequestAudit: MemberPrivacyRequestAudit): MemberPrivacyRequestAudit
}
