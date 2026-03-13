package com.back.boundedContexts.member.adapter.`in`.web

import com.back.boundedContexts.member.application.port.`in`.MemberUseCase
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_ICON_ALLOWED
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_ICON_ALLOWED
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.boundedContexts.post.application.port.out.PostImageStoragePort
import com.back.global.app.AppConfig
import com.back.global.exception.app.AppException
import com.back.global.storage.app.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.standard.dto.member.type1.MemberSearchSortType1
import com.back.standard.dto.page.PageDto
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.cache.annotation.CacheEvict
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.*
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.multipart.MultipartFile
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@Validated
@RestController
@RequestMapping("/member/api/v1/adm/members")
class ApiV1AdmMemberController(
    private val memberUseCase: MemberUseCase,
    private val postImageStorageService: PostImageStoragePort,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    private enum class LinkSection(
        val displayName: String,
        val defaultIcon: String,
        val allowedIcons: Set<String>,
    ) {
        SERVICE("serviceLinks", PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE, PROFILE_SERVICE_ICON_ALLOWED),
        CONTACT("contactLinks", PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE, PROFILE_CONTACT_ICON_ALLOWED),
    }

    data class UpdateProfileImgRequest(
        @field:NotBlank
        @field:Size(max = 2000)
        val profileImgUrl: String,
    )

    data class UpdateProfileCardRequest(
        @field:Size(max = 100)
        val role: String,
        @field:Size(max = 1000)
        val bio: String,
        @field:Size(max = 120)
        val homeIntroTitle: String,
        @field:Size(max = 500)
        val homeIntroDescription: String,
        @field:Size(max = 30)
        val serviceLinks: List<@Valid ProfileCardLinkItemRequest> = emptyList(),
        @field:Size(max = 30)
        val contactLinks: List<@Valid ProfileCardLinkItemRequest> = emptyList(),
    )

    data class ProfileCardLinkItemRequest(
        @field:Size(max = 40)
        val icon: String = "",
        @field:NotBlank
        @field:Size(max = 80)
        val label: String,
        @field:NotBlank
        @field:Size(max = 2000)
        val href: String,
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
            memberUseCase
                .findPagedByKw(
                    kw = normalizedKw,
                    sort = sort,
                    page = page,
                    pageSize = pageSize,
                ).map(::MemberWithUsernameDto),
        )
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun getItem(
        @PathVariable
        @Positive
        id: Int,
    ): MemberWithUsernameDto {
        val member = memberUseCase.findById(id).orElseThrow()

        return MemberWithUsernameDto(member)
    }

    @PatchMapping("/{id}/profileImgUrl")
    @Transactional
    @CacheEvict(cacheNames = ["member-admin-profile"], allEntries = true)
    fun updateProfileImg(
        @PathVariable
        @Positive
        id: Int,
        @RequestBody @Valid reqBody: UpdateProfileImgRequest,
    ): MemberWithUsernameDto {
        val member = memberUseCase.findById(id).orElseThrow()
        memberUseCase.modify(member, member.nickname, reqBody.profileImgUrl.trim())

        return MemberWithUsernameDto(member)
    }

    @PostMapping("/{id}/profileImageFile")
    @Transactional
    fun uploadProfileImageFile(
        @PathVariable
        @Positive
        id: Int,
        @RequestPart("file") file: MultipartFile,
    ): MemberWithUsernameDto {
        val member = memberUseCase.findById(id).orElseThrow()
        val key = postImageStorageService.uploadPostImage(file)
        uploadedFileRetentionService.registerTempUpload(
            objectKey = key,
            contentType = file.contentType.orEmpty(),
            fileSize = file.size,
            purpose = UploadedFilePurpose.PROFILE_IMAGE,
        )
        val encodedKey =
            URLEncoder
                .encode(key, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/")
        val imageUrl = "${AppConfig.siteBackUrl}/post/api/v1/images/$encodedKey"
        memberUseCase.modify(member, member.nickname, imageUrl)

        return MemberWithUsernameDto(member)
    }

    @PatchMapping("/{id}/profileCard")
    @Transactional
    fun updateProfileCard(
        @PathVariable
        @Positive
        id: Int,
        @RequestBody @Valid reqBody: UpdateProfileCardRequest,
    ): MemberWithUsernameDto {
        val member = memberUseCase.findById(id).orElseThrow()
        memberUseCase.modifyProfileCard(
            member = member,
            role = reqBody.role.trim(),
            bio = reqBody.bio.trim(),
            homeIntroTitle = reqBody.homeIntroTitle.trim(),
            homeIntroDescription = reqBody.homeIntroDescription.trim(),
            serviceLinks = reqBody.serviceLinks.normalize(LinkSection.SERVICE),
            contactLinks = reqBody.contactLinks.normalize(LinkSection.CONTACT),
        )
        return MemberWithUsernameDto(member)
    }

    private fun List<ProfileCardLinkItemRequest>.normalize(section: LinkSection): List<MemberProfileLinkItem> =
        mapIndexed { index, link ->
            val normalizedIcon = link.icon.trim().ifBlank { section.defaultIcon }
            if (normalizedIcon !in section.allowedIcons) {
                throw AppException(
                    "400-1",
                    "${section.displayName}[$index].icon 값이 유효하지 않습니다: $normalizedIcon",
                )
            }

            MemberProfileLinkItem(
                icon = normalizedIcon,
                label = link.label.trim(),
                href = link.href.trim(),
            )
        }
}
