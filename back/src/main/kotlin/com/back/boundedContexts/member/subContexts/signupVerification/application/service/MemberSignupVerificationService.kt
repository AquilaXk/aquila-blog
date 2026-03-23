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

/**
 * `SignupEmailStartResult` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class SignupEmailStartResult(
    val email: String,
)

/**
 * `SignupEmailVerifyResult` 데이터 클래스입니다.
 * - 역할: 요청/응답/이벤트/상태 전달용 불변 데이터 구조를 담당합니다.
 * - 주의: 변경 시 호출 경계와 데이터 흐름 영향을 함께 검토합니다.
 */
data class SignupEmailVerifyResult(
    val email: String,
    val signupToken: String,
    val expiresAt: Instant,
)

/**
 * MemberSignupVerificationService는 유스케이스 단위 비즈니스 흐름을 조합하는 애플리케이션 서비스입니다.
 * 트랜잭션 경계, 도메인 규칙 적용, 후속 동기화(캐시/이벤트/스토리지)를 담당합니다.
 */
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

    /**
     * 생성/시작 처리 흐름을 수행하고 중복 요청과 예외 케이스를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
    @Transactional
    fun start(
        email: String,
        nextPath: String? = null,
        clientIp: String = "unknown",
    ): SignupEmailStartResult {
        val normalizedEmail = normalizeEmail(email)
        val canStart = signupStartRateLimitService.checkAndConsume(normalizedEmail, clientIp)
        if (!canStart) {
            throw AppException("429-2", "이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")
        }
        // 계정 열거 방지를 위해 이미 가입된 이메일이어도 동일한 성공 응답을 반환한다.
        if (memberRepository.existsByEmail(normalizedEmail)) {
            return SignupEmailStartResult(email = normalizedEmail)
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

    /**
     * verifyEmail 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    /**
     * 생성/시작 처리 흐름을 수행하고 중복 요청과 예외 케이스를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    /**
     * buildVerificationLink 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 서비스 계층에서 트랜잭션 경계와 후속 처리(캐시/이벤트/스토리지 동기화)를 함께 관리합니다.
     */
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

    /**
     * 외부 입력값을 내부 규칙에 맞게 정규화합니다.
     * 애플리케이션 서비스 계층에서 예외 처리와 트랜잭션 경계, 후속 작업을 함께 관리합니다.
     */
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
}
