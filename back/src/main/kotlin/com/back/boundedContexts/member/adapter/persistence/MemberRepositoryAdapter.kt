package com.back.boundedContexts.member.adapter.persistence

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.Member
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowCallbackHandler
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.Optional

@Component
class MemberRepositoryAdapter(
    private val memberRepository: MemberRepository,
    private val jdbcTemplate: JdbcTemplate,
) : MemberRepositoryPort {
    override fun count(): Long = memberRepository.count()

    override fun save(member: Member): Member = memberRepository.save(member)

    override fun saveAndFlush(member: Member): Member = memberRepository.saveAndFlush(member)

    override fun existsByEmail(email: String): Boolean = memberRepository.existsByEmail(email)

    override fun findByLoginId(loginId: String): Member? = memberRepository.findByLoginId(loginId)

    override fun findByEmail(email: String): Member? = memberRepository.findByEmail(email)

    override fun lockEmailIdentityProvisioning(email: String) {
        check(TransactionSynchronizationManager.isActualTransactionActive()) {
            "Email identity provisioning requires an active transaction."
        }
        jdbcTemplate.query(
            "SELECT pg_advisory_xact_lock(?, ?)",
            RowCallbackHandler { },
            EMAIL_IDENTITY_PROVISIONING_LOCK_NAMESPACE.hashCode(),
            email.hashCode(),
        )
    }

    override fun findByApiKey(apiKey: String): Member? = memberRepository.findByApiKey(apiKey)

    override fun findById(id: Long): Optional<Member> = memberRepository.findById(id)

    override fun findByIdForUpdate(id: Long): Optional<Member> = memberRepository.findByIdForUpdate(id)

    override fun getReferenceById(id: Long): Member = memberRepository.getReferenceById(id)

    private companion object {
        private const val EMAIL_IDENTITY_PROVISIONING_LOCK_NAMESPACE = "member-email-provisioning"
    }
}
