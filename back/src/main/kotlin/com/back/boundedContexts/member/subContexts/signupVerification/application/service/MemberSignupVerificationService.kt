package com.back.boundedContexts.member.subContexts.signupVerification.application.service

import com.back.boundedContexts.member.application.port.output.MemberRepositoryPort
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.subContexts.signupVerification.application.port.output.MemberSignupVerificationRepositoryPort
import com.back.boundedContexts.member.subContexts.signupVerification.domain.MemberSignupVerification
import com.back.boundedContexts.member.subContexts.signupVerification.dto.SendSignupVerificationMailPayload
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.task.application.TaskFacade
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
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
    private val signupStartRateLimitService: SignupStartRateLimitService,
    @Value("\${custom.member.signup.verifyPath:/signup/verify}")
    private val verifyPath: String,
    @Value("\${custom.member.signup.emailExpirationSeconds:86400}")
    private val emailExpirationSeconds: Long,
    @Value("\${custom.member.signup.sessionExpirationSeconds:3600}")
    private val sessionExpirationSeconds: Long,
) {
    companion object {
        private const val MAX_EMAIL_LENGTH = 320
        private val EMAIL_FORMAT_REGEX =
            Regex(
                "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$",
            )
    }

    @Transactional
    fun start(
        email: String,
        termsAccepted: Boolean = false,
        privacyAccepted: Boolean = false,
        legalPolicyVersion: String? = null,
        nextPath: String? = null,
        clientIp: String = "unknown",
    ): SignupEmailStartResult {
        val normalizedEmail = normalizeEmail(email)
        val normalizedLegalPolicyVersion =
            normalizeLegalPolicyVersion(
                termsAccepted = termsAccepted,
                privacyAccepted = privacyAccepted,
                legalPolicyVersion = legalPolicyVersion,
            )
        val canStart = signupStartRateLimitService.checkAndConsume(normalizedEmail, clientIp)
        if (!canStart) {
            throw AppException("429-2", "이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")
        }
        if (memberRepository.existsByEmail(normalizedEmail)) {
            throw AppException("409-2", "이미 가입된 이메일입니다.")
        }

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
                    termsAcceptedAt = now,
                    privacyAcceptedAt = now,
                    legalPolicyVersion = normalizedLegalPolicyVersion,
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
        if (memberRepository.existsByEmail(verification.email)) {
            verification.cancel(now)
            throw AppException("404-2", "유효하지 않은 회원가입 링크입니다.")
        }

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
        if (memberRepository.existsByEmail(verification.email)) {
            verification.cancel(now)
            throw AppException("404-2", "유효하지 않은 회원가입 세션입니다.")
        }

        val member =
            memberApplicationService.joinWithVerifiedEmail(
                email = verification.email,
                password = password,
                nickname = nickname,
                profileImgUrl = null,
            )

        verification.consume(now)

        return member
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
                append(URLEncoder.encode(normalizedNextPath, StandardCharsets.UTF_8))
            }
        }
    }

    private fun normalizeNextPath(nextPath: String?): String? {
        val trimmed = nextPath?.trim()?.takeIf { it.isNotBlank() } ?: return null

        if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
            return null
        }

        // Next.js 데이터 라우트나 제어문자 경로는 리다이렉트 대상으로 허용하지 않는다.
        if (trimmed.startsWith("/_next/data/")) return null
        if (trimmed.any { it == '\r' || it == '\n' }) return null

        return trimmed
    }

    private fun normalizeEmail(email: String): String =
        email
            .trim()
            .lowercase(Locale.ROOT)
            .ifBlank { throw AppException("400-2", "이메일을 입력해주세요.") }
            .also { normalized ->
                if (normalized.length > MAX_EMAIL_LENGTH || !EMAIL_FORMAT_REGEX.matches(normalized)) {
                    throw AppException("400-2", "이메일 형식을 확인해주세요.")
                }
            }

    private fun normalizeLegalPolicyVersion(
        termsAccepted: Boolean,
        privacyAccepted: Boolean,
        legalPolicyVersion: String?,
    ): String {
        if (!termsAccepted || !privacyAccepted) {
            throw AppException("400-2", "회원가입을 진행하려면 이용약관과 개인정보처리방침에 모두 동의해야 합니다.")
        }

        return legalPolicyVersion
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?.also { version ->
                if (version.length > 32) {
                    throw AppException("400-2", "약관 동의 버전이 올바르지 않습니다.")
                }
            } ?: throw AppException("400-2", "약관 동의 버전이 올바르지 않습니다.")
    }
}
