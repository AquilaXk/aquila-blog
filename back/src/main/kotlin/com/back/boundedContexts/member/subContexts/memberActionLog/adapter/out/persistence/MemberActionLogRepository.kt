package com.back.boundedContexts.member.subContexts.memberActionLog.adapter.out.persistence

import com.back.boundedContexts.member.subContexts.memberActionLog.application.port.out.MemberActionLogRepositoryPort
import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import org.springframework.data.jpa.repository.JpaRepository

interface MemberActionLogRepository :
    JpaRepository<MemberActionLog, Int>,
    MemberActionLogRepositoryPort
