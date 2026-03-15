package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import org.springframework.stereotype.Component

@Component
class MemberAttrPersistenceAdapter(
    private val memberAttrRepository: MemberAttrRepository,
) : MemberAttrRepositoryPort {
    override fun findBySubjectAndName(
        subject: Member,
        name: String,
    ): MemberAttr? = memberAttrRepository.findBySubjectAndName(subject, name)

    override fun findBySubjectInAndNameIn(
        subjects: List<Member>,
        names: List<String>,
    ): List<MemberAttr> = memberAttrRepository.findBySubjectInAndNameIn(subjects, names)

    override fun existsByNameAndStrValue(
        name: String,
        strValue: String,
    ): Boolean = memberAttrRepository.existsByNameAndStrValue(name, strValue)

    override fun existsByNameAndStrValueContaining(
        name: String,
        valueFragment: String,
    ): Boolean = memberAttrRepository.existsByNameAndStrValueContaining(name, valueFragment)

    override fun existsBySubjectIdAndNameAndStrValueContaining(
        subjectId: Int,
        name: String,
        valueFragment: String,
    ): Boolean = memberAttrRepository.existsBySubjectIdAndNameAndStrValueContaining(subjectId, name, valueFragment)

    override fun save(attr: MemberAttr): MemberAttr = memberAttrRepository.save(attr)
}
