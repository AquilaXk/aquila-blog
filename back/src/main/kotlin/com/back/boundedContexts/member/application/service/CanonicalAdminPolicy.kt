package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AdminProperties
import org.springframework.stereotype.Component

@Component
class CanonicalAdminPolicy(
    private val adminProperties: AdminProperties,
) {
    fun canAuthenticate(member: Member): Boolean =
        member.deletedAt == null &&
            (!member.isAdmin || adminProperties.matchesEmail(member.email))
}
