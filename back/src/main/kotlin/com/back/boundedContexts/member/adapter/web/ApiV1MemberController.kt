package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.rsData.RsData
import com.back.global.security.application.SecurityTipProvider
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.net.URI

/**
 * ApiV1MemberController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@RequestMapping("/member/api/v1/members")
class ApiV1MemberController(
    private val memberUseCase: MemberUseCase,
    private val securityTipProvider: SecurityTipProvider,
) {
    companion object {
        const val ADMIN_PROFILE_CACHE_NAME = "member-admin-profile-v2"
    }

    @GetMapping("/randomSecureTip")
    fun randomSecureTip() = securityTipProvider.signupPasswordTip()

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @GetMapping("/adminProfile")
    @Transactional(readOnly = true)
    fun getAdminProfile(): MemberWithUsernameDto {
        val adminUsername = AppConfig.adminUsernameOrBlank.trim()
        val adminEmail = AppConfig.adminEmailOrBlank.trim()

        if (adminUsername.isBlank() && adminEmail.isBlank()) {
            throw AppException("404-1", "관리자 프로필이 설정되지 않았습니다.")
        }

        val adminMember =
            adminEmail
                .takeIf { it.isNotBlank() }
                ?.let(memberUseCase::findByEmail)
                ?: adminUsername
                    .takeIf { it.isNotBlank() }
                    ?.let(memberUseCase::findByUsername)
                ?: throw AppException("404-1", "관리자 프로필을 찾을 수 없습니다.")

        return MemberWithUsernameDto(adminMember)
    }

    /**
     * redirectToProfileImg 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @GetMapping("/{id}/redirectToProfileImg")
    @ResponseStatus(HttpStatus.FOUND)
    @Transactional(readOnly = true)
    fun redirectToProfileImg(
        @PathVariable id: Long,
    ): ResponseEntity<Void> {
        val member = memberUseCase.findById(id).orElseThrow()

        // 프로필 사진은 변경 가능한 자산이므로 redirect 응답을 강하게 캐시하지 않는다.
        val cacheControl = CacheControl.noCache().cachePrivate()

        return ResponseEntity
            .status(HttpStatus.FOUND)
            .location(URI.create(member.profileImgUrlOrDefault))
            .cacheControl(cacheControl)
            .build()
    }

    data class MemberJoinRequest(
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

    /**
     * 회원 가입 요청을 검증하고 계정을 생성합니다.
     * 컨트롤러 계층에서 요청 DTO를 검증한 뒤 서비스 호출 결과를 응답 규격으로 변환합니다.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    fun join(
        @RequestBody @Valid reqBody: MemberJoinRequest,
    ): RsData<MemberDto> {
        val member =
            memberUseCase.join(
                reqBody.username,
                reqBody.password,
                reqBody.nickname,
                null,
            )

        return RsData(
            "201-1",
            "${member.nickname}님 환영합니다. 회원가입이 완료되었습니다.",
            MemberDto(member),
        )
    }
}
