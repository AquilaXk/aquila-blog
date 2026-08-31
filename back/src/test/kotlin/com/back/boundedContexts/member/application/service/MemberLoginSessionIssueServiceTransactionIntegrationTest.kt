package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.boundedContexts.member.subContexts.session.model.MemberSession
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.support.BaseSeededIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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

    @Test
    fun `every verified admin email login retires credentials and prior sessions`() {
        val oldSessionKey = "legacy-admin-session-${System.nanoTime()}"
        val legacyApiKey = MemberPolicy.genApiKey()
        val memberId =
            inTransaction {
                val member = memberRepository.findByEmail("admin@test.com")!!
                member.password = "legacy-password"
                member.modifyApiKey(legacyApiKey)
                memberSessionRepository.saveAndFlush(
                    MemberSession(
                        member = member,
                        sessionKey = oldSessionKey,
                    ),
                )
                member.id
            }

        val firstIssued =
            memberLoginSessionIssueService.issueAdminEmail(
                email = "admin@test.com",
                nickname = "관리자",
                rememberLoginEnabled = true,
                createdIp = "203.0.113.10",
                userAgent = "transaction-integration-test",
            )

        inTransaction {
            val member = memberRepository.findById(memberId).orElseThrow()
            assertThat(member.password).isNull()
            assertThat(member.apiKey).isNotBlank().isNotEqualTo(legacyApiKey)
            assertThat(firstIssued.apiKey).isEqualTo(member.apiKey)
            assertThat(memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(oldSessionKey)).isNull()
            assertThat(memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(firstIssued.sessionKey)).isNotNull()
        }

        val secondIssued =
            memberLoginSessionIssueService.issueAdminEmail(
                email = "admin@test.com",
                nickname = "관리자",
                rememberLoginEnabled = true,
                createdIp = "203.0.113.11",
                userAgent = "transaction-integration-test",
            )

        inTransaction {
            assertThat(secondIssued.apiKey).isNotEqualTo(firstIssued.apiKey)
            assertThat(memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(firstIssued.sessionKey)).isNull()
            assertThat(memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(secondIssued.sessionKey)).isNotNull()
        }
    }

    @Test
    fun `concurrent first verified email logins create one administrator identity`() {
        inTransaction {
            memberRepository.findByEmail("admin@test.com")!!.email = "former-admin-${System.nanoTime()}@test.com"
        }
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)

        val issued =
            Executors.newFixedThreadPool(2).use { executor ->
                val results =
                    List(2) { index ->
                        executor.submit<MemberUseCase.IssuedLoginSession> {
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS)) { "concurrent administrator login start timed out" }
                            memberLoginSessionIssueService.issueAdminEmail(
                                email = "admin@test.com",
                                nickname = "관리자",
                                rememberLoginEnabled = true,
                                createdIp = "203.0.113.${20 + index}",
                                userAgent = "transaction-integration-test",
                            )
                        }
                    }

                assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue()
                start.countDown()
                results.map { it.get(20, TimeUnit.SECONDS) }
            }

        assertThat(issued.map { it.member.id }.distinct()).hasSize(1)
        assertThat(issued.map { it.apiKey }.distinct()).hasSize(2)
        inTransaction {
            val member = memberRepository.findByEmail("admin@test.com")!!
            assertThat(member.isAdmin).isTrue()
            assertThat(
                issued.count { session ->
                    memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(session.sessionKey) != null
                },
            ).isEqualTo(1)
        }
    }

    @Test
    fun `missing locked member rejects login issue without creating a session`() {
        val sessionCountBefore = inTransaction { memberSessionRepository.count() }

        assertThatThrownBy {
            memberLoginSessionIssueService.issue(
                memberId = Long.MAX_VALUE,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.9",
                userAgent = "transaction-integration-test",
            )
        }.isInstanceOfSatisfying(AppException::class.java) { exception ->
            assertThat(exception.errorCode).isEqualTo(ErrorCode.NOT_FOUND)
        }

        assertThat(inTransaction { memberSessionRepository.count() }).isEqualTo(sessionCountBefore)
    }

    @Test
    fun `ordinary active member issues a privacy access session`() {
        val memberId = memberIdFor("user1@test.com")
        val sessionCountBefore = inTransaction { memberSessionRepository.count() }

        val issued =
            memberLoginSessionIssueService.issue(
                memberId = memberId,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.9",
                userAgent = "transaction-integration-test",
            )

        assertThat(issued.member.id).isEqualTo(memberId)
        assertThat(issued.member.isAdmin).isFalse()
        assertThat(inTransaction { memberSessionRepository.count() }).isEqualTo(sessionCountBefore + 1)
    }

    @Test
    fun `canonical admin with a stored password rejects generic issue without mutation`() {
        val memberId =
            inTransaction {
                memberRepository
                    .findByEmail("admin@test.com")!!
                    .also { member -> member.password = "legacy-password" }
                    .id
            }

        assertLoginIssueRejectedWithoutSession(memberId)
        assertThat(inTransaction { memberRepository.findById(memberId).orElseThrow().password })
            .isEqualTo("legacy-password")
    }

    @Test
    fun `active admin with a noncanonical email rejects login issue without creating a session`() {
        val memberId =
            inTransaction {
                memberRepository
                    .saveAndFlush(
                        Member(
                            username = "wrong-admin",
                            password = "1234",
                            nickname = "Wrong admin",
                            email = "wrong-admin@test.com",
                            apiKey = MemberPolicy.genApiKey(),
                        ).also { it.grantAdmin() },
                    ).id
            }

        assertLoginIssueRejectedWithoutSession(memberId)
    }

    private fun memberIdFor(email: String): Long = inTransaction { memberRepository.findByEmail(email)!!.id }

    private fun assertLoginIssueRejectedWithoutSession(memberId: Long) {
        val sessionCountBefore = inTransaction { memberSessionRepository.count() }

        assertThatThrownBy {
            memberLoginSessionIssueService.issue(
                memberId = memberId,
                rememberLoginEnabled = true,
                ipSecurityEnabled = false,
                ipSecurityFingerprint = null,
                createdIp = "203.0.113.9",
                userAgent = "transaction-integration-test",
            )
        }.isInstanceOf(AppException::class.java)
            .extracting("errorCode")
            .isEqualTo(ErrorCode.UNAUTHORIZED)

        assertThat(inTransaction { memberSessionRepository.count() }).isEqualTo(sessionCountBefore)
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
