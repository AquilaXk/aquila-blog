package com.back.boundedContexts.member.subContexts.memberActionLog.adapter.persistence

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.output.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import org.springframework.data.jpa.repository.JpaRepository

interface MemberActionLogRepository :
    JpaRepository<MemberActionLog, Int>,
    MemberActionLogRepositoryPort
