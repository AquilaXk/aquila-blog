package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.support.BaseSeededIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate

class MemberLoginSessionIssueServiceTransactionIntegrationTest : BaseSeededIntegrationTest() {
    @Autowired
    private lateinit var memberLoginSessionIssueService: MemberLoginSessionIssueService

    @Autowired
    private lateinit var memberRepository: MemberRepositoryPort

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @Autowired
    private lateinit var authTokenService: AuthTokenService

    @Autowired
    private lateinit var transactionManager: PlatformTransactionManager

    @Test
    fun `issue commits normalized member and active refresh session before returning`() {
        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse()

        val memberId =
            inTransaction {
                memberRepository
                    .findByEmail("user1@test.com")!!
                    .also { member -> member.modifyApiKey(member.username) }
                    .id
            }

        val issued =
            memberLoginSessionIssueService.issue(
                memberId = memberId,
                rememberLoginEnabled = false,
                ipSecurityEnabled = true,
                ipSecurityFingerprint = "203.0.113.9",
                createdIp = "203.0.113.9",
                userAgent = "transaction-integration-test",
            )

        assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse()

        val persisted =
            inTransaction {
                val member = memberRepository.findById(memberId).orElseThrow()
                val session = memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(issued.sessionKey)
                PersistedLoginIssue(
                    apiKey = member.apiKey,
                    memberRememberLoginEnabled = member.rememberLoginEnabled,
                    memberIpSecurityEnabled = member.ipSecurityEnabled,
                    memberIpSecurityFingerprint = member.ipSecurityFingerprint,
                    sessionMemberId = session?.member?.id,
                    refreshTokenHash = session?.refreshTokenHash,
                    rememberLoginEnabled = session?.rememberLoginEnabled,
                    ipSecurityEnabled = session?.ipSecurityEnabled,
                    ipSecurityFingerprint = session?.ipSecurityFingerprint,
                )
            }

        assertThat(issued.member.id).isEqualTo(memberId)
        assertThat(issued.apiKey).isEqualTo(persisted.apiKey)
        assertThat(issued.apiKey).isNotBlank().isNotEqualTo("user1")
        assertThat(persisted.memberRememberLoginEnabled).isFalse()
        assertThat(persisted.memberIpSecurityEnabled).isTrue()
        assertThat(persisted.memberIpSecurityFingerprint).isEqualTo("203.0.113.9")
        assertThat(persisted.sessionMemberId).isEqualTo(memberId)
        assertThat(persisted.refreshTokenHash).isNotBlank().isNotEqualTo(issued.refreshToken)
        assertThat(persisted.rememberLoginEnabled).isFalse()
        assertThat(persisted.ipSecurityEnabled).isTrue()
        assertThat(persisted.ipSecurityFingerprint).isEqualTo("203.0.113.9")
        assertThat(authTokenService.payload(issued.accessToken)?.sessionKey).isEqualTo(issued.sessionKey)
    }

    private fun <T> inTransaction(block: () -> T): T = requireNotNull(TransactionTemplate(transactionManager).execute { block() })

    private data class PersistedLoginIssue(
        val apiKey: String,
        val memberRememberLoginEnabled: Boolean,
        val memberIpSecurityEnabled: Boolean,
        val memberIpSecurityFingerprint: String?,
        val sessionMemberId: Long?,
        val refreshTokenHash: String?,
        val rememberLoginEnabled: Boolean?,
        val ipSecurityEnabled: Boolean?,
        val ipSecurityFingerprint: String?,
    )
}
