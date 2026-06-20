package com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output

import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog

interface MemberActionLogRepositoryPort {
    fun save(memberActionLog: MemberActionLog): MemberActionLog
}
