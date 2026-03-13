package com.back.boundedContexts.member.adapter.`in`.web

import com.back.boundedContexts.member.application.port.`in`.MemberUseCase
import com.back.boundedContexts.member.dto.MemberDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.rsData.RsData
import com.back.global.security.app.SecurityTipProvider
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

@RestController
@RequestMapping("/member/api/v1/members")
class ApiV1MemberController(
    private val memberUseCase: MemberUseCase,
    private val securityTipProvider: SecurityTipProvider,
) {
    @GetMapping("/randomSecureTip")
    fun randomSecureTip() = securityTipProvider.signupPasswordTip()

    @GetMapping("/adminProfile")
    @Transactional(readOnly = true)
    fun getAdminProfile(): MemberWithUsernameDto {
        // 운영에서 "관리자 1명" 규칙을 보장하기 위해 id가 아닌 고정 username으로 조회한다.
        val adminUsername = AppConfig.adminUsernameOrBlank.trim()
        if (adminUsername.isBlank()) {
            throw AppException("404-1", "관리자 프로필이 설정되지 않았습니다.")
        }

        val adminMember =
            memberUseCase.findByUsername(adminUsername)
                ?: throw AppException("404-1", "관리자 프로필을 찾을 수 없습니다.")

        return MemberWithUsernameDto(adminMember)
    }

    @GetMapping("/{id}/redirectToProfileImg")
    @ResponseStatus(HttpStatus.FOUND)
    @Transactional(readOnly = true)
    fun redirectToProfileImg(
        @PathVariable id: Int,
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
