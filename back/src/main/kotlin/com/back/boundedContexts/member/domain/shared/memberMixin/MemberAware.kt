package com.back.boundedContexts.member.domain.shared.memberMixin

import com.back.boundedContexts.member.domain.shared.Member

interface MemberAware {
    val id: Int
    val name: String
    val member: Member
}
