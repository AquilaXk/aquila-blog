package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.subContexts.privacy.application.service.OperatorPrivacyDeletionResult
import com.back.boundedContexts.member.subContexts.privacy.application.service.OperatorPrivacyExportResult
import com.back.boundedContexts.member.subContexts.privacy.application.service.OperatorPrivacyRequestDto
import com.back.boundedContexts.member.subContexts.privacy.application.service.PrivacyRightsApplicationService
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestHoldStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestRequesterRole
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import com.back.global.security.domain.SecurityUser
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/member/api/v1/adm/privacy/requests")
class ApiV1AdmPrivacyRightsController(
    private val privacyRightsApplicationService: PrivacyRightsApplicationService,
) {
    data class CreateRequest(
        @field:NotNull val operationId: UUID,
        @field:NotNull val type: MemberPrivacyRequestType,
        @field:NotBlank @field:Size(max = 320) val requesterContact: String,
        @field:Size(max = 1000) val message: String? = null,
    )

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @AuthenticationPrincipal securityUser: SecurityUser,
        @RequestBody @Valid body: CreateRequest,
    ): OperatorPrivacyRequestDto =
        privacyRightsApplicationService.createOperatorEmailRequest(
            operationId = body.operationId,
            adminId = securityUser.id,
            type = body.type,
            requesterContact = body.requesterContact,
            message = body.message,
        )

    @GetMapping
    fun list(): List<OperatorPrivacyRequestDto> = privacyRightsApplicationService.operatorRequests()

    @GetMapping("/{requestId}")
    fun detail(
        @PathVariable requestId: Long,
    ): OperatorPrivacyRequestDto = privacyRightsApplicationService.operatorRequest(requestId)

    data class IdentityDecision(
        @field:NotNull val operationId: UUID,
        @field:NotNull val approved: Boolean?,
        val requesterRole: MemberPrivacyRequestRequesterRole? = null,
        val memberId: Long? = null,
        val accountDeletionId: Long? = null,
    )

    data class HoldDecision(
        @field:NotNull val operationId: UUID,
        @field:NotNull val status: MemberPrivacyRequestHoldStatus,
        @field:Size(max = 64) val scope: String? = null,
        @field:Size(max = 1000) val reason: String? = null,
        @field:Size(max = 1000) val releaseDecision: String? = null,
    )

    data class StepUpDecision(
        @field:NotNull val operationId: UUID,
        @field:NotNull val approved: Boolean?,
    )

    data class FinalDecision(
        @field:NotNull val operationId: UUID,
        @field:NotNull val status: MemberPrivacyRequestStatus,
    )

    data class OperationRequest(
        @field:NotNull val operationId: UUID,
    )

    data class DeletionRequest(
        @field:NotNull val operationId: UUID,
        @field:Size(max = 500) val reason: String? = null,
    )

    @PostMapping("/{requestId}/identity-decisions")
    fun identity(
        @AuthenticationPrincipal user: SecurityUser,
        @PathVariable requestId: Long,
        @RequestBody @Valid body: IdentityDecision,
    ): OperatorPrivacyRequestDto =
        privacyRightsApplicationService.decideIdentity(
            requestId = requestId,
            operationId = body.operationId,
            adminId = user.id,
            approved = requireNotNull(body.approved),
            requesterRole = body.requesterRole,
            memberId = body.memberId,
            accountDeletionId = body.accountDeletionId,
        )

    @PostMapping("/{requestId}/hold-decisions")
    fun hold(
        @AuthenticationPrincipal user: SecurityUser,
        @PathVariable requestId: Long,
        @RequestBody @Valid body: HoldDecision,
    ): OperatorPrivacyRequestDto =
        privacyRightsApplicationService.decideHold(
            requestId = requestId,
            operationId = body.operationId,
            adminId = user.id,
            status = body.status,
            scope = body.scope,
            reason = body.reason,
            releaseDecision = body.releaseDecision,
        )

    @PostMapping("/{requestId}/step-up-decisions")
    fun stepUp(
        @AuthenticationPrincipal user: SecurityUser,
        @PathVariable requestId: Long,
        @RequestBody @Valid body: StepUpDecision,
    ): OperatorPrivacyRequestDto =
        privacyRightsApplicationService.decideStepUp(
            requestId = requestId,
            operationId = body.operationId,
            adminId = user.id,
            approved = requireNotNull(body.approved),
        )

    @PostMapping("/{requestId}/decisions")
    fun decide(
        @AuthenticationPrincipal user: SecurityUser,
        @PathVariable requestId: Long,
        @RequestBody @Valid body: FinalDecision,
    ): OperatorPrivacyRequestDto =
        privacyRightsApplicationService.decideRequest(
            requestId = requestId,
            operationId = body.operationId,
            adminId = user.id,
            status = body.status,
        )

    @PostMapping("/{requestId}/exports")
    fun export(
        @AuthenticationPrincipal user: SecurityUser,
        @PathVariable requestId: Long,
        @RequestBody @Valid body: OperationRequest,
    ): OperatorPrivacyExportResult =
        privacyRightsApplicationService.exportOperatorRequest(
            requestId = requestId,
            operationId = body.operationId,
            adminId = user.id,
        )

    @PostMapping("/{requestId}/deletions")
    fun delete(
        @AuthenticationPrincipal user: SecurityUser,
        @PathVariable requestId: Long,
        @RequestBody @Valid body: DeletionRequest,
    ): OperatorPrivacyDeletionResult =
        privacyRightsApplicationService.deleteForOperator(
            requestId = requestId,
            operationId = body.operationId,
            adminId = user.id,
            reason = body.reason,
        )
}
