package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.adapter.persistence.MemberAttrRepository
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort
import org.springframework.stereotype.Component

@Component
class MemberAttrRepositoryAdapter(
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

    override fun incrementIntValue(
        subject: Member,
        name: String,
        delta: Int,
    ): Int = memberAttrRepository.incrementIntValue(subject, name, delta)

    override fun save(attr: MemberAttr): MemberAttr = memberAttrRepository.save(attr)
}
