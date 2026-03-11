package com.back.boundedContexts.member.`in`

import com.back.boundedContexts.member.app.MemberFacade
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PageDto
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.*

@Validated
@RestController
@RequestMapping("/member/api/v1/adm/members")
class ApiV1AdmMemberController(
    private val memberFacade: MemberFacade,
) {
    data class UpdateProfileImgRequest(
        @field:NotBlank
        @field:Size(max = 2000)
        val profileImgUrl: String,
    )

    @GetMapping
    @Transactional(readOnly = true)
    fun getItems(
        @RequestParam(defaultValue = "1")
        @Min(1)
        page: Int,
        @RequestParam(defaultValue = "30")
        @Min(1)
        @Max(30)
        pageSize: Int,
        @RequestParam(defaultValue = "") kw: String,
        @RequestParam(defaultValue = "CREATED_AT") sort: MemberSearchSortType1,
    ): PageDto<MemberWithUsernameDto> {
        val normalizedKw = kw.trim()

        return PageDto(
            memberFacade.findPagedByKw(
                kw = normalizedKw,
                sort = sort,
                page = page,
                pageSize = pageSize,
            ).map(::MemberWithUsernameDto)
        )
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(
        @PathVariable
        @Positive
        id: Int,
    ): MemberWithUsernameDto {
        val member = memberFacade.findById(id).orElseThrow()

        return MemberWithUsernameDto(member)
    }

    @PatchMapping("/{id}/profileImgUrl")
    @Transactional
    fun updateProfileImg(
        @PathVariable
        @Positive
        id: Int,
        @RequestBody @Valid reqBody: UpdateProfileImgRequest,
    ): MemberWithUsernameDto {
        val member = memberFacade.findById(id).orElseThrow()
        memberFacade.modify(member, member.nickname, reqBody.profileImgUrl.trim())

        return MemberWithUsernameDto(member)
    }
}
