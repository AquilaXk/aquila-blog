package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.application.service.CanonicalAdminPolicy
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.app.AdminProperties
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/member/api/v1/members")
class ApiV1MemberController(
    private val memberUseCase: MemberUseCase,
    private val currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase,
    private val adminProperties: AdminProperties,
    private val canonicalAdminPolicy: CanonicalAdminPolicy,
) {
    companion object {
        const val ADMIN_PROFILE_CACHE_NAME = "member-admin-profile-v2"
    }

    @GetMapping("/adminProfile")
    @Transactional(readOnly = true)
    fun getAdminProfile(): MemberWithUsernameDto {
        val adminEmail = adminProperties.normalizedEmail

        if (adminEmail.isBlank()) {
            throw AppException(ErrorCode.NOT_FOUND, "관리자 프로필이 설정되지 않았습니다.")
        }

        val adminMember =
            adminEmail
                .takeIf { it.isNotBlank() }
                ?.let(memberUseCase::findByEmail)
                ?.takeIf(canonicalAdminPolicy::canAuthenticate)
                ?: throw AppException(ErrorCode.NOT_FOUND, "관리자 프로필을 찾을 수 없습니다.")

        return currentMemberProfileQueryUseCase.getPublishedById(adminMember.id)
    }
}
