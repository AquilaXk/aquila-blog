package com.back.boundedContexts.member.subContexts.oauthSignup.adapter.web

import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.subContexts.legalAcceptance.application.dto.LegalAcceptanceCommand
import com.back.boundedContexts.member.subContexts.oauthSignup.application.port.input.OAuthSignupUseCase
import com.back.boundedContexts.member.subContexts.oauthSignup.application.service.OAuthSignupPendingDetails
import com.back.global.rsData.RsData
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/member/api/v1/signup/social")
class ApiV1OAuthSignupController(
    private val oauthSignupUseCase: OAuthSignupUseCase,
) {
    data class SocialSignupPendingRequest(
        @field:NotBlank
        val token: String,
    )

    data class SocialSignupCompleteRequest(
        @field:NotBlank
        val token: String,
        @field:Size(min = 2, max = 30)
        val nickname: String? = null,
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

    @PostMapping("/pending")
    @Transactional(readOnly = true)
    fun pending(
        @RequestBody @Valid reqBody: SocialSignupPendingRequest,
    ): RsData<OAuthSignupPendingDetails> =
        RsData(
            "200-3",
            "소셜 회원가입 세션을 확인했습니다.",
            oauthSignupUseCase.findPending(reqBody.token),
        )

    @PostMapping("/complete")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun complete(
        @RequestBody @Valid reqBody: SocialSignupCompleteRequest,
    ): RsData<MemberDto> {
        val member =
            oauthSignupUseCase.completeSignup(
                pendingToken = reqBody.token,
                nickname = reqBody.nickname,
                legalAcceptance = reqBody.toLegalAcceptanceCommand(),
            )

        return RsData(
            "201-3",
            "${member.nickname}님 환영합니다. 소셜 회원가입이 완료되었습니다.",
            MemberDto(member),
        )
    }
}
