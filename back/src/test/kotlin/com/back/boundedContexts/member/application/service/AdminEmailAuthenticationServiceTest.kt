package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.adapter.mail.AdminLoginMailSender
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AdminProperties
import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyBoolean
import org.mockito.ArgumentMatchers.anyLong
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import java.time.Duration

class AdminEmailAuthenticationServiceTest {
    private val admin = Member(1L, "admin", null, "Admin", ADMIN_EMAIL, true)
    private val memberUseCase = mock(MemberUseCase::class.java)
    private val mailSender = mock(AdminLoginMailSender::class.java)
    private val requestTiming = mock(AdminEmailRequestTiming::class.java)
    private val challengeStore = InMemoryAdminEmailChallengeStore()
    private val redis = InMemoryRedisKeyValuePort()
    private val service =
        newService(challengeExpirationSeconds = 600)

    @Test
    fun `default challenge expiration is 600 seconds`() {
        val defaultService =
            AdminEmailAuthenticationService(
                adminProperties = AdminProperties(email = ADMIN_EMAIL),
                canonicalAdminPolicy = CanonicalAdminPolicy(AdminProperties(email = ADMIN_EMAIL)),
                memberUseCase = memberUseCase,
                adminEmailChallengeStore = challengeStore,
                redisKeyValuePort = redis,
                mailSender = mailSender,
                requestTiming = requestTiming,
            )

        assertThat(defaultService.requestCode("someone@example.com", rememberMe = false).expiresInSeconds).isEqualTo(600)
    }

    @Test
    fun `invalid authentication configuration fails with its bounded property message`() {
        assertThatThrownBy { newService(challengeExpirationSeconds = 59) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.challengeExpirationSeconds must be between 60 and 1800.")
        assertThatThrownBy { newService(maxFailedAttempts = 1) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.maxFailedAttempts must be between 2 and 10.")
        assertThatThrownBy { newService(requestMaxPerWindow = 0) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.requestMaxPerWindow must be between 1 and 20.")
        assertThatThrownBy { newService(requestWindowSeconds = 59) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("custom.auth.adminEmail.requestWindowSeconds must be between 60 and 3600.")
    }

    @Test
    fun `verified code is consumed once and preserves explicit persistence choice`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        val issued = issuedSession(rememberLoginEnabled = true)
        `when`(
            memberUseCase.issueAdminEmailLoginSession(
                memberId = admin.id,
                rememberLoginEnabled = true,
                createdIp = "127.0.0.1",
                userAgent = "test-agent",
            ),
        ).thenReturn(issued)
        var deliveredCode = ""
        doAnswer { invocation ->
            assertThat(invocation.getArgument<String>(0)).isEqualTo(ADMIN_EMAIL)
            deliveredCode = invocation.getArgument(1)
            null
        }.`when`(mailSender).sendCode(anyString(), anyString(), anyLong())

        val challenge = service.requestCode(ADMIN_EMAIL, rememberMe = true)
        val verified =
            service.verifyCode(
                challengeId = challenge.challengeId,
                code = deliveredCode,
                createdIp = "127.0.0.1",
                userAgent = "test-agent",
            )

        assertThat(deliveredCode).matches("\\d{8}")
        assertThat(verified).isSameAs(issued)
        assertThat(challengeStore.challenges).isEmpty()
        assertThatThrownBy {
            service.verifyCode(challenge.challengeId, deliveredCode, "127.0.0.1", "test-agent")
        }.isInstanceOfSatisfying(AppException::class.java) { exception ->
            assertThat(exception.errorCode).isEqualTo(ErrorCode.UNAUTHORIZED)
        }
    }

    @Test
    fun `wrong or unknown code creates no administrator session`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        var deliveredCode = ""
        doAnswer { invocation ->
            assertThat(invocation.getArgument<String>(0)).isEqualTo(ADMIN_EMAIL)
            deliveredCode = invocation.getArgument(1)
            null
        }.`when`(mailSender).sendCode(anyString(), anyString(), anyLong())

        val challenge = service.requestCode(ADMIN_EMAIL, rememberMe = false)
        val wrongCode = if (deliveredCode == "00000000") "00000001" else "00000000"

        assertThatThrownBy {
            service.verifyCode(challenge.challengeId, wrongCode, null, null)
        }.isInstanceOf(AppException::class.java)
        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `unknown email returns an opaque challenge without sending mail or storing authority`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        val challenge = service.requestCode("someone@example.com", rememberMe = true)

        assertThat(challenge.challengeId).isNotBlank()
        assertThat(challengeStore.challenges).isEmpty()
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
    }

    @Test
    fun `matching and unknown requests complete through the same timing boundary`() {
        val timing = mock(AdminEmailRequestTiming::class.java)
        `when`(timing.startedAtNanos()).thenReturn(11L, 22L)
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        doAnswer { null }.`when`(mailSender).sendCode(anyString(), anyString(), anyLong())
        val timedService = newService(requestTiming = timing)

        timedService.requestCode("someone@example.com", rememberMe = false)
        timedService.requestCode(ADMIN_EMAIL, rememberMe = false)

        verify(timing).awaitMinimum(11L)
        verify(timing).awaitMinimum(22L)
    }

    @Test
    fun `smtp failure returns the same opaque outcome as an unknown email and creates no session`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        doThrow(IllegalStateException("smtp unavailable"))
            .`when`(mailSender)
            .sendCode(anyString(), anyString(), anyLong())

        val smtpFailure = service.requestCode(ADMIN_EMAIL, rememberMe = true)
        val unknownEmail = service.requestCode("someone@example.com", rememberMe = true)

        assertThat(smtpFailure.expiresInSeconds).isEqualTo(unknownEmail.expiresInSeconds)
        assertThat(smtpFailure.challengeId).isNotBlank()
        assertThat(challengeStore.challenges).isEmpty()
        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `unavailable redis fails closed before mail delivery`() {
        challengeStore.available = false
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        assertThatThrownBy { service.requestCode(ADMIN_EMAIL, rememberMe = false) }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
            }
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
    }

    @Test
    fun `challenge issue failure fails closed before mail delivery`() {
        challengeStore.issueFailure = IllegalStateException("redis write failed")
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        assertDependencyUnavailable { service.requestCode(ADMIN_EMAIL, rememberMe = false) }

        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `challenge discard failure after mail failure fails closed`() {
        challengeStore.discardFailure = IllegalStateException("redis delete failed")
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        doThrow(IllegalStateException("smtp unavailable"))
            .`when`(mailSender)
            .sendCode(anyString(), anyString(), anyLong())

        assertDependencyUnavailable { service.requestCode(ADMIN_EMAIL, rememberMe = false) }

        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `challenge consume failure fails closed without issuing a session`() {
        challengeStore.consumeFailure = IllegalStateException("redis read failed")

        assertDependencyUnavailable { service.verifyCode("challenge", "00000000", null, null) }

        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `request slot runtime failure fails closed before challenge or mail delivery`() {
        challengeStore.requestSlotFailure = IllegalStateException("redis counter failed")
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        assertDependencyUnavailable { service.requestCode(ADMIN_EMAIL, rememberMe = false) }

        assertThat(challengeStore.challenges).isEmpty()
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `request limit is opaque and does not send or store another challenge`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        doAnswer { null }.`when`(mailSender).sendCode(anyString(), anyString(), anyLong())

        repeat(5) { service.requestCode(ADMIN_EMAIL, rememberMe = false) }
        val limited = service.requestCode(ADMIN_EMAIL, rememberMe = false)

        assertThat(limited.challengeId).isNotBlank()
        assertThat(challengeStore.challenges).hasSize(5)
        verify(mailSender, org.mockito.Mockito.times(5)).sendCode(anyString(), anyString(), anyLong())
    }

    @Test
    fun `wrong attempts exhaust the challenge without issuing a session`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)
        var deliveredCode = ""
        doAnswer { invocation ->
            assertThat(invocation.getArgument<String>(0)).isEqualTo(ADMIN_EMAIL)
            deliveredCode = invocation.getArgument(1)
            null
        }.`when`(mailSender).sendCode(anyString(), anyString(), anyLong())

        val challenge = service.requestCode(ADMIN_EMAIL, rememberMe = false)
        val wrongCode = if (deliveredCode == "00000000") "00000001" else "00000000"

        repeat(5) {
            assertThatThrownBy { service.verifyCode(challenge.challengeId, wrongCode, null, null) }
                .isInstanceOf(AppException::class.java)
        }

        assertThat(challengeStore.challenges).doesNotContainKey(challenge.challengeId)
        verify(memberUseCase, never()).issueAdminEmailLoginSession(anyLong(), anyBoolean(), anyString(), anyString())
    }

    @Test
    fun `internal readiness proves canonical admin redis atomicity and smtp transport without sending mail`() {
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        service.verifyReadiness()

        assertThat(redis.entries).isEmpty()
        verify(mailSender).verifyConnection()
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
    }

    @Test
    fun `readiness fails closed when the canonical administrator is missing`() {
        assertDependencyUnavailable { service.verifyReadiness() }

        verify(mailSender, never()).verifyConnection()
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
    }

    @Test
    fun `readiness fails closed when redis round trip does not preserve the probe`() {
        redis.getAndDeleteOverride = "mismatch"
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        assertDependencyUnavailable { service.verifyReadiness() }

        verify(mailSender).verifyConnection()
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
    }

    @Test
    fun `readiness fails closed when redis probe throws`() {
        redis.setFailure = IllegalStateException("redis unavailable")
        `when`(memberUseCase.findByEmail(ADMIN_EMAIL)).thenReturn(admin)

        assertDependencyUnavailable { service.verifyReadiness() }

        verify(mailSender).verifyConnection()
        verify(mailSender, never()).sendCode(anyString(), anyString(), anyLong())
    }

    private fun newService(
        challengeExpirationSeconds: Long = 600,
        maxFailedAttempts: Int = 5,
        requestMaxPerWindow: Int = 5,
        requestWindowSeconds: Long = 600,
        requestTiming: AdminEmailRequestTiming = this.requestTiming,
    ) = AdminEmailAuthenticationService(
        adminProperties = AdminProperties(email = ADMIN_EMAIL),
        canonicalAdminPolicy = CanonicalAdminPolicy(AdminProperties(email = ADMIN_EMAIL)),
        memberUseCase = memberUseCase,
        adminEmailChallengeStore = challengeStore,
        redisKeyValuePort = redis,
        mailSender = mailSender,
        requestTiming = requestTiming,
        challengeExpirationSeconds = challengeExpirationSeconds,
        maxFailedAttempts = maxFailedAttempts,
        requestMaxPerWindow = requestMaxPerWindow,
        requestWindowSeconds = requestWindowSeconds,
    )

    private fun assertDependencyUnavailable(action: () -> Unit) {
        assertThatThrownBy { action() }
            .isInstanceOfSatisfying(AppException::class.java) { exception ->
                assertThat(exception.errorCode).isEqualTo(ErrorCode.DEPENDENCY_NOT_READY)
            }
    }

    private fun issuedSession(rememberLoginEnabled: Boolean) =
        MemberUseCase.IssuedLoginSession(
            member = admin,
            apiKey = "api-key",
            accessToken = "access-token",
            refreshToken = "refresh-token",
            sessionKey = "session-key",
            rememberLoginEnabled = rememberLoginEnabled,
        )

    private class InMemoryRedisKeyValuePort : RedisKeyValuePort {
        var available = true
        var setFailure: RuntimeException? = null
        var getAndDeleteOverride: String? = null
        val entries = mutableMapOf<String, String>()

        override fun isAvailable(): Boolean = available

        override fun get(key: String): String? = entries[key]

        override fun getAndDelete(key: String): String? = getAndDeleteOverride ?: entries.remove(key)

        override fun set(
            key: String,
            value: String,
            ttl: Duration?,
        ) {
            setFailure?.let { throw it }
            entries[key] = value
        }

        override fun increment(key: String): Long? = null

        override fun expire(
            key: String,
            ttl: Duration,
        ): Boolean = false

        override fun delete(keys: Collection<String>): Long {
            val removed = keys.count { entries.remove(it) != null }
            return removed.toLong()
        }

        override fun keys(pattern: String): Set<String> = entries.keys
    }

    private class InMemoryAdminEmailChallengeStore : AdminEmailChallengeStore {
        var available = true
        var issueFailure: RuntimeException? = null
        var discardFailure: RuntimeException? = null
        var consumeFailure: RuntimeException? = null
        var requestSlotFailure: RuntimeException? = null
        val challenges = mutableMapOf<String, AdminEmailChallengeStore.Challenge>()
        private val failures = mutableMapOf<String, Int>()
        private var requestCount = 0

        override fun isAvailable(): Boolean = available

        override fun issue(challenge: AdminEmailChallengeStore.Challenge) {
            issueFailure?.let { throw it }
            challenges[challenge.challengeId] = challenge
            failures[challenge.challengeId] = 0
        }

        override fun consume(
            challengeId: String,
            submittedCodeHash: String,
            maxFailedAttempts: Int,
        ): AdminEmailChallengeStore.ConsumeResult {
            consumeFailure?.let { throw it }
            val challenge = challenges[challengeId] ?: return AdminEmailChallengeStore.ConsumeResult.Invalid
            if (challenge.codeHash == submittedCodeHash) {
                discard(challengeId)
                return AdminEmailChallengeStore.ConsumeResult.Matched(challenge.memberId, challenge.rememberMe)
            }
            val updatedFailures = (failures[challengeId] ?: 0) + 1
            failures[challengeId] = updatedFailures
            return if (updatedFailures >= maxFailedAttempts) {
                discard(challengeId)
                AdminEmailChallengeStore.ConsumeResult.Exhausted
            } else {
                AdminEmailChallengeStore.ConsumeResult.Invalid
            }
        }

        override fun discard(challengeId: String) {
            discardFailure?.let { throw it }
            challenges.remove(challengeId)
            failures.remove(challengeId)
        }

        override fun acquireRequestSlot(
            canonicalRecipientHash: String,
            maxRequests: Int,
            window: Duration,
        ): Boolean {
            requestSlotFailure?.let { throw it }
            return ++requestCount <= maxRequests
        }
    }

    companion object {
        private const val ADMIN_EMAIL = "admin@example.com"
    }
}
