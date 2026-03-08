package com.back.boundedContexts.member.domain.shared

import java.util.*

object MemberPolicy {
    val SYSTEM = Member(1, "system", null, "시스템")
    fun genApiKey(): String = UUID.randomUUID().toString()
}
