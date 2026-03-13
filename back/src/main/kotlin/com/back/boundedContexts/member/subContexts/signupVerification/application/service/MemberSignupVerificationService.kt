package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import com.back.boundedContexts.member.application.port.out.MemberRepositoryPort
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.signupVerification.application.port.out.MemberSignupVerificationRepositoryPort
import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import com.back.boundedContexts.member.subContexts.signupVerification.dto.SendSignupVerificationMailPayload
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.task.app.TaskFacade
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.Locale
import java.util.UUID

data class SignupEmailStartResult(
    val email: String,
)

data class SignupEmailVerifyResult(
    val email: String,
    val signupToken: String,
    val expiresAt: Instant,
)

@Service
class MemberSignupVerificationService(
    private val memberRepository: MemberRepositoryPort,
    private val memberApplicationService: MemberApplicationService,
    private val memberSignupVerificationRepository: MemberSignupVerificationRepositoryPort,
    private val taskFacade: TaskFacade,
    @Value("\${custom.member.signup.verifyPath:/signup/verify}")
    private val verifyPath: String,
    @Value("\${custom.member.signup.emailExpirationSeconds:86400}")
    private val emailExpirationSeconds: Long,
    @Value("\${custom.member.signup.sessionExpirationSeconds:3600}")
    private val sessionExpirationSeconds: Long,
) {
    @Transactional
    fun start(
        email: String,
        nextPath: String? = null,
    ): SignupEmailStartResult {
        val normalizedEmail = normalizeEmail(email)
        ensureEmailAvailable(normalizedEmail)

        val now = Instant.now()
        memberSignupVerificationRepository
            .findTopByEmail(normalizedEmail)
            ?.takeIf { it.consumedAt == null && it.cancelledAt == null }
            ?.cancel(now)

        val verificationExpiresAt = now.plusSeconds(emailExpirationSeconds)
        val verification =
            memberSignupVerificationRepository.save(
                MemberSignupVerification(
                    email = normalizedEmail,
                    emailVerificationToken = UUID.randomUUID().toString(),
                    emailVerificationExpiresAt = verificationExpiresAt,
                ),
            )

        taskFacade.addToQueue(
            SendSignupVerificationMailPayload(
                uid = UUID.randomUUID(),
                aggregateType = MemberSignupVerification::class.simpleName!!,
                aggregateId = verification.id,
                toEmail = normalizedEmail,
                verificationLink = buildVerificationLink(verification.emailVerificationToken, nextPath),
                expiresAt = verificationExpiresAt,
            ),
        )

        return SignupEmailStartResult(email = normalizedEmail)
    }

    @Transactional
    fun verifyEmail(emailVerificationToken: String): SignupEmailVerifyResult {
        val normalizedToken = emailVerificationToken.trim()
        if (normalizedToken.isBlank()) {
            throw AppException("400-2", "회원가입 링크가 올바르지 않습니다.")
        }

        val now = Instant.now()
        val verification =
            memberSignupVerificationRepository.findByEmailVerificationToken(normalizedToken)
                ?: throw AppException("404-2", "유효하지 않은 회원가입 링크입니다.")

        verification.ensureVerifiable(now)
        ensureEmailAvailable(verification.email)

        val sessionToken = UUID.randomUUID().toString()
        val sessionExpiresAt = now.plusSeconds(sessionExpirationSeconds)
        verification.issueSignupSession(sessionToken, sessionExpiresAt, now)

        return SignupEmailVerifyResult(
            email = verification.email,
            signupToken = sessionToken,
            expiresAt = sessionExpiresAt,
        )
    }

    @Transactional
    fun completeSignup(
        signupToken: String,
        username: String,
        password: String,
        nickname: String,
    ): Member {
        val normalizedToken = signupToken.trim()
        if (normalizedToken.isBlank()) {
            throw AppException("400-2", "회원가입 세션이 올바르지 않습니다.")
        }

        val now = Instant.now()
        val verification =
            memberSignupVerificationRepository.findBySignupSessionToken(normalizedToken)
                ?: throw AppException("404-2", "유효하지 않은 회원가입 세션입니다.")

        verification.ensureCompletable(now)
        ensureEmailAvailable(verification.email)

        val member =
            memberApplicationService.join(
                username = username,
                password = password,
                nickname = nickname,
                profileImgUrl = null,
                email = verification.email,
            )

        verification.consume(now)

        return member
    }

    private fun ensureEmailAvailable(email: String) {
        if (memberRepository.existsByEmail(email)) {
            throw AppException("409-2", "이미 사용 중인 이메일입니다.")
        }
    }

    private fun buildVerificationLink(
        token: String,
        nextPath: String?,
    ): String {
        val normalizedPath =
            verifyPath
                .trim()
                .ifBlank { "/signup/verify" }
                .let { path ->
                    if (path.startsWith("/")) {
                        path
                    } else {
                        "/$path"
                    }
                }

        val normalizedNextPath = normalizeNextPath(nextPath)

        return buildString {
            append(AppConfig.siteFrontUrl)
            append(normalizedPath)
            append("?token=")
            append(token)

            if (normalizedNextPath != null) {
                append("&next=")
                append(normalizedNextPath)
            }
        }
    }

    private fun normalizeNextPath(nextPath: String?): String? {
        val trimmed = nextPath?.trim()?.takeIf { it.isNotBlank() } ?: return null

        if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
            return null
        }

        return trimmed
    }

    private fun normalizeEmail(email: String): String =
        email
            .trim()
            .lowercase(Locale.ROOT)
            .ifBlank { throw AppException("400-2", "이메일을 입력해주세요.") }
}
