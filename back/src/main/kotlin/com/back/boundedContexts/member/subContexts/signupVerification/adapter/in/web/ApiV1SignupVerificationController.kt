package com.back.boundedContexts.member.subContexts.signupVerification.adapter.`in`.web

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.MemberSignupVerificationService
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailStartResult
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailVerifyResult
import com.back.global.rsData.RsData
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
        val nextPath: String? = null,
    )

    data class SignupCompleteRequest(
        @field:NotBlank
        val signupToken: String,
        @field:NotBlank
        @field:Size(min = 2, max = 30)
        val username: String,
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
    )

    @PostMapping("/email/start")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Transactional
    fun start(
        @RequestBody @Valid reqBody: SignupEmailStartRequest,
    ): RsData<SignupEmailStartResult> {
        val result =
            memberSignupVerificationService.start(
                email = reqBody.email,
                nextPath = reqBody.nextPath,
            )

        return RsData(
            "202-1",
            "회원가입 링크가 이메일로 전송되었습니다.",
            result,
        )
    }

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
                username = reqBody.username,
                password = reqBody.password,
                nickname = reqBody.nickname,
            )

        return RsData(
            "201-2",
            "${member.nickname}님 환영합니다. 이메일 인증 회원가입이 완료되었습니다.",
            MemberDto(member),
        )
    }
}
