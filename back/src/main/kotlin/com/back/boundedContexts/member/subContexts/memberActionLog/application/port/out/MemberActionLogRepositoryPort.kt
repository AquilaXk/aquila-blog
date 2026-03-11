package com.back.boundedContexts.member.subContexts.memberActionLog.application.port.out

import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog

interface MemberActionLogRepositoryPort {
    fun save(memberActionLog: MemberActionLog): MemberActionLog
}
