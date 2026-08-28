package com.back.boundedContexts.member.subContexts.notification.application.port.output

import java.time.Instant

interface MemberNotificationRepositoryPort {
    fun deleteCreatedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
