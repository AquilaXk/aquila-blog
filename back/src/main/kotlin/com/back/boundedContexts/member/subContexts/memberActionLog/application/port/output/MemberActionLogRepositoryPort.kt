package com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output

import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import java.time.Instant

interface MemberActionLogRepositoryPort {
    fun save(memberActionLog: MemberActionLog): MemberActionLog

    fun deleteCreatedBefore(
        cutoff: Instant,
        limit: Int,
    ): Int
}
