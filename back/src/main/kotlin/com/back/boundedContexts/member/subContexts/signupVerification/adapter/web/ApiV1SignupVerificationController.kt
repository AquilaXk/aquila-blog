package com.back.boundedContexts.member.subContexts.signupVerification.adapter.web

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.MemberSignupVerificationService
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailStartResult
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailVerifyResult
import com.back.global.rsData.RsData
import com.back.global.web.application.Rq
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.Duration
import java.time.Instant

@RestController
@RequestMapping("/member/api/v1/signup")
class ApiV1SignupVerificationController(
    private val memberSignupVerificationService: MemberSignupVerificationService,
    private val rq: Rq,
) {
    companion object {
        const val SIGNUP_SESSION_COOKIE_NAME = "signup_session"
    }

    data class SignupEmailStartRequest(
        @field:Email
        @field:NotBlank
        val email: String,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val termsAccepted: Boolean,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val privacyAccepted: Boolean,
        @field:Schema(
            requiredMode = Schema.RequiredMode.REQUIRED,
            minLength = 1,
            maxLength = 32,
        )
        val legalPolicyVersion: String,
        val nextPath: String? = null,
    )

    data class SignupEmailVerifyRequest(
        @field:NotBlank
        val token: String,
    )

    data class SignupCompleteRequest(
        @field:Pattern(
            regexp = "^$",
            message = "username 필드는 더 이상 지원되지 않습니다.",
        )
        val username: String? = null,
        @field:NotBlank
        @field:Size(min = 8, max = 64)
        @field:Pattern(
            regexp = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,64}$",
            message = "비밀번호는 8~64자이며 영문 대문자/소문자/숫자/특수문자를 모두 포함해야 합니다.",
        )
        val password: String,
        @field:NotBlank
        @field:Size(min = 2, max = 30)
        val nickname: String,
        @field:NotBlank
        @field:Size(max = 32)
        val termsVersion: String,
        @field:NotBlank
        @field:Size(min = 64, max = 64)
        val termsContentSha256: String,
        @field:NotBlank
        @field:Size(max = 32)
        val privacyVersion: String,
        @field:NotBlank
        @field:Size(min = 64, max = 64)
        val privacyContentSha256: String,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val age14OrOlder: Boolean,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val requiredPrivacyConfirmed: Boolean,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val analyticsConsent: Boolean,
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val overseasTransferAcknowledged: Boolean,
    ) {
        fun toLegalAcceptanceCommand(): LegalAcceptanceCommand =
            LegalAcceptanceCommand(
                termsVersion = termsVersion,
                termsContentSha256 = termsContentSha256,
                privacyVersion = privacyVersion,
                privacyContentSha256 = privacyContentSha256,
                age14OrOlder = age14OrOlder,
                requiredPrivacyConfirmed = requiredPrivacyConfirmed,
                analyticsConsent = analyticsConsent,
                overseasTransferAcknowledged = overseasTransferAcknowledged,
            )
    }

    @PostMapping("/email/start")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    fun start(
        @RequestBody @Valid reqBody: SignupEmailStartRequest,
    ): RsData<SignupEmailStartResult> {
        val result =
            memberSignupVerificationService.start(
                email = reqBody.email,
                termsAccepted = reqBody.termsAccepted,
                privacyAccepted = reqBody.privacyAccepted,
                legalPolicyVersion = reqBody.legalPolicyVersion,
                nextPath = reqBody.nextPath,
                clientIp = rq.clientIp,
            )

        return RsData(
            "202-1",
            "회원가입 링크가 이메일로 전송되었습니다.",
            result,
        )
    }

    @GetMapping("/email/verify")
    @ResponseStatus(HttpStatus.GONE)
    fun verifyLegacyGet(): RsData<Void> =
        RsData(
            "410-3",
            "query 기반 회원가입 인증 링크는 더 이상 지원되지 않습니다. 새 인증 메일을 요청해주세요.",
        )

    @PostMapping("/email/verify")
    @Transactional
    fun verify(
        @RequestBody @Valid reqBody: SignupEmailVerifyRequest,
    ): RsData<SignupEmailVerifyResult> {
        val result = memberSignupVerificationService.verifyEmail(reqBody.token)
        rq.setCookie(
            SIGNUP_SESSION_COOKIE_NAME,
            result.signupToken,
            maxAgeSeconds = cookieMaxAgeSeconds(result.expiresAt),
        )

        return RsData(
            "200-2",
            "이메일 인증이 완료되었습니다.",
            SignupEmailVerifyResult(
                email = result.email,
                expiresAt = result.expiresAt,
            ),
        )
    }

    @PostMapping("/complete")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun complete(
        @RequestBody @Valid reqBody: SignupCompleteRequest,
    ): RsData<MemberDto> {
        val member =
            memberSignupVerificationService.completeSignup(
                signupToken = rq.getCookieValue(SIGNUP_SESSION_COOKIE_NAME, ""),
                password = reqBody.password,
                nickname = reqBody.nickname,
                legalAcceptance = reqBody.toLegalAcceptanceCommand(),
            )
        rq.deleteCookie(SIGNUP_SESSION_COOKIE_NAME)

        return RsData(
            "201-2",
            "${member.nickname}님 환영합니다. 이메일 인증 회원가입이 완료되었습니다.",
            MemberDto(member),
        )
    }

    private fun cookieMaxAgeSeconds(expiresAt: Instant): Int =
        Duration
            .between(Instant.now(), expiresAt)
            .seconds
            .coerceIn(1, Int.MAX_VALUE.toLong())
            .toInt()
}
