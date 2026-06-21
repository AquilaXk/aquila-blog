package com.back.boundedContexts.member.subContexts.signupVerification.adapter.web

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.service.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.MemberSignupVerificationService
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailStartResult
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailVerifyResult
import com.back.global.rsData.RsData
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.servlet.http.HttpServletRequest
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
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/member/api/v1/signup")
class ApiV1SignupVerificationController(
    private val memberSignupVerificationService: MemberSignupVerificationService,
) {
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

    data class SignupCompleteRequest(
        @field:NotBlank
        val signupToken: String,
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
        request: HttpServletRequest,
        @RequestBody @Valid reqBody: SignupEmailStartRequest,
    ): RsData<SignupEmailStartResult> {
        val result =
            memberSignupVerificationService.start(
                email = reqBody.email,
                termsAccepted = reqBody.termsAccepted,
                privacyAccepted = reqBody.privacyAccepted,
                legalPolicyVersion = reqBody.legalPolicyVersion,
                nextPath = reqBody.nextPath,
                clientIp = extractClientIp(request),
            )

        return RsData(
            "202-1",
            "회원가입 링크가 이메일로 전송되었습니다.",
            result,
        )
    }

    private fun extractClientIp(request: HttpServletRequest): String = request.remoteAddr.orEmpty()

    @GetMapping("/email/verify")
    @Transactional
    fun verify(
        @RequestParam token: String,
    ): RsData<SignupEmailVerifyResult> {
        val result = memberSignupVerificationService.verifyEmail(token)

        return RsData(
            "200-2",
            "이메일 인증이 완료되었습니다.",
            result,
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
                signupToken = reqBody.signupToken,
                password = reqBody.password,
                nickname = reqBody.nickname,
                legalAcceptance = reqBody.toLegalAcceptanceCommand(),
            )

        return RsData(
            "201-2",
            "${member.nickname}님 환영합니다. 이메일 인증 회원가입이 완료되었습니다.",
            MemberDto(member),
        )
    }
}
