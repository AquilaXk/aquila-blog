package com.back.boundedContexts.member.application.port.out

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr

interface MemberAttrRepositoryPort {
    fun findBySubjectAndName(
        subject: Member,
        name: String,
    ): MemberAttr?

    fun findBySubjectInAndNameIn(
        subjects: List<Member>,
        names: List<String>,
    ): List<MemberAttr>

    fun existsByNameAndStrValue(
        name: String,
        strValue: String,
    ): Boolean

    fun save(attr: MemberAttr): MemberAttr
}
