package com.back.boundedContexts.member.adapter.out.persistence

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr

interface MemberAttrRepositoryCustom {
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
}
