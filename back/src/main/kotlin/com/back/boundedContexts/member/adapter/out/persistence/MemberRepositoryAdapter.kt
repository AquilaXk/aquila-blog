package com.back.boundedContexts.member.adapter.out.persistence

import com.back.boundedContexts.member.application.port.out.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Component
import java.util.Optional

@Component
class MemberRepositoryAdapter(
    private val memberRepository: MemberRepository,
) : MemberRepositoryPort {
    override fun count(): Long = memberRepository.count()

    override fun save(member: Member): Member = memberRepository.save(member)

    override fun saveAndFlush(member: Member): Member = memberRepository.saveAndFlush(member)

    override fun existsByEmail(email: String): Boolean = memberRepository.existsByEmail(email)

    override fun findByUsername(username: String): Member? = memberRepository.findByUsername(username)

    override fun findByEmail(email: String): Member? = memberRepository.findByEmail(email)

    override fun findByApiKey(apiKey: String): Member? = memberRepository.findByApiKey(apiKey)

    override fun findById(id: Int): Optional<Member> = memberRepository.findById(id)

    override fun getReferenceById(id: Int): Member = memberRepository.getReferenceById(id)

    override fun findQPagedByKw(
        kw: String,
        pageable: Pageable,
    ): Page<Member> = memberRepository.findQPagedByKw(kw, pageable)
}
