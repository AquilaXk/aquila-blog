package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutSectionBlock
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileLinkItem
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_ICON_ALLOWED
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_ICON_ALLOWED
import com.back.boundedContexts.member.domain.shared.memberMixin.PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE
import com.back.boundedContexts.member.domain.shared.memberMixin.normalizeProfileLinkHref
import com.back.boundedContexts.member.dto.AuthSessionMemberDto
import com.back.boundedContexts.member.dto.MemberProfileWorkspaceResponseDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.UploadedFileRetentionService
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
import org.springframework.http.MediaType
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * ApiV1AdmMemberController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@Validated
@RestController
@RequestMapping("/member/api/v1/adm/members")
class ApiV1AdmMemberController(
    private val memberUseCase: MemberUseCase,
    private val currentMemberProfileQueryUseCase: CurrentMemberProfileQueryUseCase,
    private val postImageStorageService: PostImageStoragePort,
    private val postImageStorageProperties: PostImageStorageProperties,
    private val uploadedFileRetentionService: UploadedFileRetentionService,
) {
    companion object {
        private const val PROFILE_IMAGE_MAX_FILE_SIZE_BYTES = 2L * 1024 * 1024
    }

    data class AdminHubBootstrapResponse(
        val member: AuthSessionMemberDto,
        val profile: MemberWithUsernameDto,
    )

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
        val role: String = "",
        @field:Size(max = 1000)
        val bio: String = "",
        @field:Size(max = 100)
        val aboutRole: String? = null,
        @field:Size(max = 2000)
        val aboutBio: String? = null,
        @field:Size(max = 12000)
        val aboutDetails: String? = null,
        @field:Size(max = 120)
        val blogTitle: String = "",
        @field:Size(max = 120)
        val homeIntroTitle: String = "",
        @field:Size(max = 500)
        val homeIntroDescription: String = "",
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

    data class ProfileWorkspaceSectionRequest(
        @field:Size(max = 80)
        val id: String = "",
        @field:Size(max = 120)
        val title: String = "",
        @field:Size(max = 20)
        val items: List<String> = emptyList(),
        val dividerBefore: Boolean = false,
    )

    data class UpdateProfileWorkspaceDraftRequest(
        @field:Size(max = 2000)
        val profileImageUrl: String = "",
        @field:Size(max = 100)
        val profileRole: String = "",
        @field:Size(max = 1000)
        val profileBio: String = "",
        @field:Size(max = 100)
        val aboutRole: String = "",
        @field:Size(max = 2000)
        val aboutBio: String = "",
        @field:Size(max = 20)
        val aboutSections: List<@Valid ProfileWorkspaceSectionRequest> = emptyList(),
        @field:Size(max = 120)
        val blogTitle: String = "",
        @field:Size(max = 120)
        val homeIntroTitle: String = "",
        @field:Size(max = 500)
        val homeIntroDescription: String = "",
        @field:Size(max = 30)
        val serviceLinks: List<@Valid ProfileCardLinkItemRequest> = emptyList(),
        @field:Size(max = 30)
        val contactLinks: List<@Valid ProfileCardLinkItemRequest> = emptyList(),
    )

    /**
     * 조회 조건을 적용해 필요한 데이터를 안전하게 반환합니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
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
        id: Long,
    ): MemberWithUsernameDto = currentMemberProfileQueryUseCase.getById(id)

    @GetMapping("/bootstrap")
    @Transactional(readOnly = true)
    fun bootstrap(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): AdminHubBootstrapResponse =
        AdminHubBootstrapResponse(
            member = AuthSessionMemberDto(securityUser),
            profile = currentMemberProfileQueryUseCase.getPublishedById(securityUser.id),
        )

    @GetMapping("/{id}/profileWorkspace")
    @Transactional(readOnly = true)
    fun getProfileWorkspace(
        @PathVariable
        @Positive
        id: Long,
    ): MemberProfileWorkspaceResponseDto = currentMemberProfileQueryUseCase.getWorkspaceById(id)

    /**
     * ProfileImg 항목을 수정한다.
     */
    @PatchMapping("/{id}/profileImgUrl")
    @Transactional
    @CacheEvict(cacheNames = [ApiV1MemberController.ADMIN_PROFILE_CACHE_NAME], allEntries = true)
    fun updateProfileImg(
        @PathVariable
        @Positive
        id: Long,
        @RequestBody @Valid reqBody: UpdateProfileImgRequest,
    ): MemberWithUsernameDto {
        val member = memberUseCase.findById(id).orElseThrow()
        memberUseCase.modify(member, member.nickname, reqBody.profileImgUrl.trim())
        return currentMemberProfileQueryUseCase.getById(id)
    }

    /**
     * uploadProfileImageFile 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @PostMapping("/{id}/profileImageFile", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Transactional
    @CacheEvict(cacheNames = [ApiV1MemberController.ADMIN_PROFILE_CACHE_NAME], allEntries = true)
    fun uploadProfileImageFile(
        @PathVariable
        @Positive
        id: Long,
        @RequestPart("file") file: MultipartFile,
    ): MemberWithUsernameDto {
        if (file.isEmpty) {
            throw AppException("400-1", "이미지 파일이 비어 있습니다.")
        }
        val maxAllowedBytes = minOf(PROFILE_IMAGE_MAX_FILE_SIZE_BYTES, postImageStorageProperties.maxFileSizeBytes)
        if (file.size > maxAllowedBytes) {
            val limitMb = (maxAllowedBytes + (1024 * 1024) - 1) / (1024 * 1024)
            throw AppException("413-1", "이미지 파일은 ${limitMb}MB 이하여야 합니다.")
        }

        val member = memberUseCase.findById(id).orElseThrow()
        val uploadRequest =
            PostImageStoragePort.UploadImageRequest(
                bytes = file.bytes,
                contentType = file.contentType,
                originalFilename = file.originalFilename,
            )
        val key = postImageStorageService.uploadPostImage(uploadRequest)
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
        return currentMemberProfileQueryUseCase.getById(id)
    }

    /**
     * ProfileCard 항목을 수정한다.
     */
    @PatchMapping("/{id}/profileCard")
    @Transactional
    @CacheEvict(cacheNames = [ApiV1MemberController.ADMIN_PROFILE_CACHE_NAME], allEntries = true)
    fun updateProfileCard(
        @PathVariable
        @Positive
        id: Long,
        @RequestBody @Valid reqBody: UpdateProfileCardRequest,
    ): MemberWithUsernameDto {
        val member = memberUseCase.findById(id).orElseThrow()
        memberUseCase.modifyProfileCard(
            member = member,
            role = reqBody.role.trim(),
            bio = reqBody.bio.trim(),
            aboutRole = reqBody.aboutRole?.trim(),
            aboutBio = reqBody.aboutBio?.trim(),
            aboutDetails = reqBody.aboutDetails?.trim(),
            blogTitle = reqBody.blogTitle.trim(),
            homeIntroTitle = reqBody.homeIntroTitle.trim(),
            homeIntroDescription = reqBody.homeIntroDescription.trim(),
            serviceLinks = reqBody.serviceLinks.normalize(LinkSection.SERVICE),
            contactLinks = reqBody.contactLinks.normalize(LinkSection.CONTACT),
        )
        return currentMemberProfileQueryUseCase.getById(id)
    }

    @PutMapping("/{id}/profileWorkspace/draft")
    @Transactional
    fun saveProfileWorkspaceDraft(
        @PathVariable
        @Positive
        id: Long,
        @RequestBody @Valid reqBody: UpdateProfileWorkspaceDraftRequest,
    ): MemberProfileWorkspaceResponseDto {
        val member = memberUseCase.findById(id).orElseThrow()
        memberUseCase.saveProfileWorkspaceDraft(member, reqBody.toDomain())
        return currentMemberProfileQueryUseCase.getWorkspaceById(id)
    }

    @PostMapping("/{id}/profileWorkspace/publish")
    @Transactional
    @CacheEvict(cacheNames = [ApiV1MemberController.ADMIN_PROFILE_CACHE_NAME], allEntries = true)
    fun publishProfileWorkspace(
        @PathVariable
        @Positive
        id: Long,
    ): MemberProfileWorkspaceResponseDto {
        val member = memberUseCase.findById(id).orElseThrow()
        memberUseCase.publishProfileWorkspace(member)
        return currentMemberProfileQueryUseCase.getWorkspaceById(id)
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
                href =
                    normalizeProfileLinkHref(link.href)
                        ?: throw AppException(
                            "400-1",
                            "${section.displayName}[$index].href 값이 유효하지 않습니다.",
                        ),
            )
        }

    private fun UpdateProfileWorkspaceDraftRequest.toDomain(): MemberProfileWorkspaceContent =
        MemberProfileWorkspaceContent(
            profileImageUrl = profileImageUrl.trim(),
            profileRole = profileRole.trim(),
            profileBio = profileBio.trim(),
            aboutRole = aboutRole.trim(),
            aboutBio = aboutBio.trim(),
            aboutSections =
                aboutSections.map {
                    MemberProfileAboutSectionBlock(
                        id = it.id.trim(),
                        title = it.title.trim(),
                        items = it.items.map(String::trim),
                        dividerBefore = it.dividerBefore,
                    )
                },
            blogTitle = blogTitle.trim(),
            homeIntroTitle = homeIntroTitle.trim(),
            homeIntroDescription = homeIntroDescription.trim(),
            serviceLinks = serviceLinks.normalize(LinkSection.SERVICE),
            contactLinks = contactLinks.normalize(LinkSection.CONTACT),
        )
}
