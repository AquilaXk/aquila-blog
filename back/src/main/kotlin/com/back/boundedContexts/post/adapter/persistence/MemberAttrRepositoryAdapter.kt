package com.back.boundedContexts.post.adapter.persistence

import com.back.boundedContexts.member.application.port.output.MemberAttrRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.MemberAttr
import org.springframework.stereotype.Component
import com.back.boundedContexts.post.application.port.output.MemberAttrRepositoryPort as PostMemberAttrRepositoryPort

/**
 * MemberAttrRepositoryAdapter는 영속 계층(JPA/쿼리) 연동을 담당하는 퍼시스턴스 어댑터입니다.
 * 도메인 요구사항에 맞는 조회/저장 연산을 DB 구현으로 매핑합니다.
 */
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
    ): Int {
        val current = memberAttrRepositoryPort.findBySubjectAndName(subject, name)
        val currentValue = current?.intValue ?: 0
        val nextValue = currentValue + delta
        val attr =
            (current ?: MemberAttr(0, subject, name, nextValue)).apply {
                intValue = nextValue
            }
        memberAttrRepositoryPort.save(attr)
        return nextValue
    }

    override fun save(attr: MemberAttr): MemberAttr = memberAttrRepositoryPort.save(attr)
}
