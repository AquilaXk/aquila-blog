package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.subContexts.privacy.application.service.AccountDeletionResult
import com.back.boundedContexts.member.subContexts.privacy.application.service.PrivacyExportResponse
import com.back.boundedContexts.member.subContexts.privacy.application.service.PrivacyRequestDto
import com.back.boundedContexts.member.subContexts.privacy.application.service.PrivacyRightsApplicationService
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.web.application.AuthCookieService
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/member/api/v1/privacy")
class ApiV1PrivacyRightsController(
    private val privacyRightsApplicationService: PrivacyRightsApplicationService,
    private val authCookieService: AuthCookieService,
) {
    data class PrivacyRequestCreateRequest(
        @field:NotNull
        @field:Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        val type: MemberPrivacyRequestType,
        @field:Size(max = 1000)
        val message: String? = null,
    )

    data class PrivacyRequestResBody(
        val item: PrivacyRequestDto,
    )

    data class AccountDeletionRequest(
        @field:NotBlank
        @field:Size(min = 1, max = 128)
        val password: String,
        @field:Size(max = 500)
        val reason: String? = null,
    )

    @GetMapping("/export")
    @Transactional(readOnly = true)
    fun export(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): RsData<PrivacyExportResponse> =
        RsData(
            "200-1",
            "개인정보 내보내기 데이터를 조회했습니다.",
            privacyRightsApplicationService.exportFor(securityUser.id),
        )

    @PostMapping("/requests")
    @ResponseStatus(HttpStatus.CREATED)
    fun createRequest(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestBody @Valid reqBody: PrivacyRequestCreateRequest,
    ): RsData<PrivacyRequestResBody> =
        RsData(
            "201-1",
            "개인정보 처리 요청을 접수했습니다.",
            PrivacyRequestResBody(
                item =
                    privacyRightsApplicationService.createRequest(
                        memberId = securityUser.id,
                        type = reqBody.type,
                        message = reqBody.message,
                    ),
            ),
        )

    @GetMapping("/requests/{requestId}")
    @Transactional(readOnly = true)
    fun getRequest(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @PathVariable requestId: Long,
    ): RsData<PrivacyRequestResBody> =
        RsData(
            "200-1",
            "개인정보 처리 요청 상태를 조회했습니다.",
            PrivacyRequestResBody(
                item = privacyRightsApplicationService.getRequest(securityUser.id, requestId),
            ),
        )

    @DeleteMapping("/account")
    fun deleteAccount(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestBody @Valid reqBody: AccountDeletionRequest,
    ): RsData<AccountDeletionResult> {
        val result =
            privacyRightsApplicationService.deleteAccount(
                memberId = securityUser.id,
                password = reqBody.password,
                reason = reqBody.reason,
            )
        authCookieService.expireAuthCookies()

        return RsData(
            "200-1",
            "계정 탈퇴가 완료되었습니다.",
            result,
        )
    }
}
