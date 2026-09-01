package com.back.boundedContexts.member.subContexts.privacy.application.port.output

import java.time.Instant

interface MemberPrivacyRequestRepositoryPort {
    fun deleteClosedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
