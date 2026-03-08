package com.back.boundedContexts.member.subContexts.memberActionLog.out

import com.back.boundedContexts.member.subContexts.memberActionLog.domain.MemberActionLog
import org.springframework.data.jpa.repository.JpaRepository

interface MemberActionLogRepository : JpaRepository<MemberActionLog, Int>
