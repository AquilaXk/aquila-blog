package com.back.boundedContexts.member.subContexts.signupVerification.adapter.web

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.MemberSignupVerificationService
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailStartResult
import com.back.boundedContexts.member.subContexts.signupVerification.application.service.SignupEmailVerifyResult
import com.back.global.rsData.RsData
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

/**
 * ApiV1SignupVerificationController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
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
        @field:Size(min = 2, max = 30)
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
    )

    /**
     * 생성/시작 처리 흐름을 수행하고 중복 요청과 예외 케이스를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
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

    /**
     * 생성/시작 처리 흐름을 수행하고 중복 요청과 예외 케이스를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @PostMapping("/complete")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun complete(
        @RequestBody @Valid reqBody: SignupCompleteRequest,
    ): RsData<MemberDto> {
        val member =
            memberSignupVerificationService.completeSignup(
                signupToken = reqBody.signupToken,
                legacyUsername = reqBody.username,
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
