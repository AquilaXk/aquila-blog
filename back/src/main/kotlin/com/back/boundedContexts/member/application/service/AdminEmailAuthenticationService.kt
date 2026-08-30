package com.back.boundedContexts.member.application.service

import com.back.boundedContexts.member.adapter.mail.AdminLoginMailSender
import com.back.boundedContexts.member.application.port.input.AdminEmailAuthenticationUseCase
import com.back.boundedContexts.member.application.port.input.AdminEmailAuthenticationUseCase.RequestedChallenge
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase.IssuedLoginSession
import com.back.boundedContexts.member.application.port.output.AdminEmailChallengeStore
import com.back.global.app.AdminProperties
import com.back.global.cache.application.port.output.RedisKeyValuePort
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Duration
import java.util.Base64
import java.util.Locale

@Service
class AdminEmailAuthenticationService(
    private val adminProperties: AdminProperties,
    private val canonicalAdminPolicy: CanonicalAdminPolicy,
    private val memberUseCase: MemberUseCase,
    private val adminEmailChallengeStore: AdminEmailChallengeStore,
    private val redisKeyValuePort: RedisKeyValuePort,
    private val mailSender: AdminLoginMailSender,
    @param:Value("\${custom.auth.adminEmail.challengeExpirationSeconds:600}")
    private val challengeExpirationSeconds: Long = 600,
    @param:Value("\${custom.auth.adminEmail.maxFailedAttempts:5}")
    private val maxFailedAttempts: Int = 5,
    @param:Value("\${custom.auth.adminEmail.requestMaxPerWindow:5}")
    private val requestMaxPerWindow: Int = 5,
    @param:Value("\${custom.auth.adminEmail.requestWindowSeconds:600}")
    private val requestWindowSeconds: Long = 600,
) : AdminEmailAuthenticationUseCase {
    init {
        require(challengeExpirationSeconds in 60..1800) {
            "custom.auth.adminEmail.challengeExpirationSeconds must be between 60 and 1800."
        }
        require(maxFailedAttempts in 2..10) {
            "custom.auth.adminEmail.maxFailedAttempts must be between 2 and 10."
        }
        require(requestMaxPerWindow in 1..20) {
            "custom.auth.adminEmail.requestMaxPerWindow must be between 1 and 20."
        }
        require(requestWindowSeconds in 60..3600) {
            "custom.auth.adminEmail.requestWindowSeconds must be between 60 and 3600."
        }
    }

    override fun requestCode(
        email: String,
        rememberMe: Boolean,
    ): RequestedChallenge {
        ensureRedisAvailable()
        val response = RequestedChallenge(randomChallengeId(), challengeExpirationSeconds)
        val normalizedEmail = email.trim().lowercase(Locale.ROOT)
        if (!adminProperties.matchesEmail(normalizedEmail)) return response

        val admin = memberUseCase.findByEmail(adminProperties.normalizedEmail)
        if (admin == null || !admin.isAdmin || !canonicalAdminPolicy.canAuthenticate(admin)) return response

        if (!acquireRequestSlot()) return response

        val challengeId = response.challengeId
        val code = randomCode()
        try {
            adminEmailChallengeStore.issue(
                AdminEmailChallengeStore.Challenge(
                    challengeId = challengeId,
                    codeHash = sha256("$challengeId:$code"),
                    memberId = admin.id,
                    rememberMe = rememberMe,
                    ttl = Duration.ofSeconds(challengeExpirationSeconds),
                ),
            )
        } catch (exception: RuntimeException) {
            throw dependencyUnavailable(exception)
        }

        try {
            mailSender.sendCode(adminProperties.normalizedEmail, code, challengeExpirationSeconds)
        } catch (exception: RuntimeException) {
            try {
                adminEmailChallengeStore.discard(challengeId)
            } catch (discardException: RuntimeException) {
                throw dependencyUnavailable(discardException)
            }
            return response
        }
        return response
    }

    override fun verifyCode(
        challengeId: String,
        code: String,
        createdIp: String?,
        userAgent: String?,
    ): IssuedLoginSession {
        ensureRedisAvailable()
        val result =
            try {
                adminEmailChallengeStore.consume(
                    challengeId = challengeId,
                    submittedCodeHash = sha256("$challengeId:$code"),
                    maxFailedAttempts = maxFailedAttempts,
                )
            } catch (exception: RuntimeException) {
                throw dependencyUnavailable(exception)
            }
        val matched = result as? AdminEmailChallengeStore.ConsumeResult.Matched ?: throw invalidChallenge()

        return memberUseCase.issueAdminEmailLoginSession(
            memberId = matched.memberId,
            rememberLoginEnabled = matched.rememberMe,
            createdIp = createdIp,
            userAgent = userAgent,
        )
    }

    override fun verifyReadiness() {
        ensureRedisAvailable()
        val admin = memberUseCase.findByEmail(adminProperties.normalizedEmail)
        if (admin == null || !admin.isAdmin || !canonicalAdminPolicy.canAuthenticate(admin)) {
            throw dependencyUnavailable()
        }

        mailSender.verifyConnection()
        val probeKey = "health:admin-email:${randomChallengeId()}"
        val probeValue = randomChallengeId()
        try {
            redisKeyValuePort.set(probeKey, probeValue, READINESS_TTL)
            if (redisKeyValuePort.getAndDelete(probeKey) != probeValue) {
                throw dependencyUnavailable()
            }
        } catch (exception: AppException) {
            throw exception
        } catch (exception: RuntimeException) {
            throw dependencyUnavailable(exception)
        }
    }

    private fun ensureRedisAvailable() {
        if (!adminEmailChallengeStore.isAvailable()) {
            throw AppException(ErrorCode.DEPENDENCY_NOT_READY, "이메일 인증을 사용할 수 없습니다.")
        }
    }

    private fun acquireRequestSlot(): Boolean =
        try {
            adminEmailChallengeStore.acquireRequestSlot(
                canonicalRecipientHash = sha256(adminProperties.normalizedEmail),
                maxRequests = requestMaxPerWindow,
                window = Duration.ofSeconds(requestWindowSeconds),
            )
        } catch (exception: RuntimeException) {
            throw dependencyUnavailable(exception)
        }

    private fun randomChallengeId(): String {
        val bytes = ByteArray(CHALLENGE_BYTES)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun randomCode(): String = secureRandom.nextInt(CODE_UPPER_BOUND).toString().padStart(CODE_LENGTH, '0')

    private fun sha256(value: String): String =
        MessageDigest
            .getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }

    private fun invalidChallenge() = AppException(ErrorCode.UNAUTHORIZED, "인증 코드가 올바르지 않거나 만료되었습니다.")

    private fun dependencyUnavailable(cause: RuntimeException? = null) =
        AppException(ErrorCode.DEPENDENCY_NOT_READY, "이메일 인증을 사용할 수 없습니다.", cause)

    companion object {
        private const val CHALLENGE_BYTES = 24
        private const val CODE_LENGTH = 8
        private const val CODE_UPPER_BOUND = 100_000_000
        private val READINESS_TTL = Duration.ofSeconds(10)
        private val secureRandom = SecureRandom()
    }
}
