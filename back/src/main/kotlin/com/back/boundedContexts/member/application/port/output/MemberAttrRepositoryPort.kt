package com.back.boundedContexts.member.application.port.output

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

    fun existsByNameAndStrValueContaining(
        name: String,
        valueFragment: String,
    ): Boolean

    fun existsBySubjectIdAndNameAndStrValueContaining(
        subjectId: Long,
        name: String,
        valueFragment: String,
    ): Boolean

    fun incrementIntValue(
        subject: Member,
        name: String,
        delta: Int = 1,
    ): Int

    fun save(attr: MemberAttr): MemberAttr
}
