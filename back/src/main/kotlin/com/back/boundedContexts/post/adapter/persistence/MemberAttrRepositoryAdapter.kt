package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import org.springframework.stereotype.Component
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort as PostMemberAttrRepositoryPort

@Component
class MemberAttrRepositoryAdapter(
    private val memberAttrRepositoryPort: MemberAttrRepositoryPort,
) : PostMemberAttrRepositoryPort {
    override fun findBySubjectAndName(
        subject: Member,
        name: String,
    ): MemberAttr? = memberAttrRepositoryPort.findBySubjectAndName(subject, name)

    override fun findBySubjectInAndNameIn(
        subjects: List<Member>,
        names: List<String>,
    ): List<MemberAttr> = memberAttrRepositoryPort.findBySubjectInAndNameIn(subjects, names)

    override fun incrementIntValue(
        subject: Member,
        name: String,
        delta: Int,
    ): Int = memberAttrRepositoryPort.incrementIntValue(subject, name, delta)

    override fun save(attr: MemberAttr): MemberAttr = memberAttrRepositoryPort.save(attr)
}
