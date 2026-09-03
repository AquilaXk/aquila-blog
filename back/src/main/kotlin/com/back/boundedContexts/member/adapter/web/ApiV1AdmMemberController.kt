package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.port.input.CurrentMemberProfileQueryUseCase
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileAboutProjectBlock
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
import com.back.boundedContexts.member.model.shared.Member
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.ProfileImageHistoryDto
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.Size
import org.springframework.cache.annotation.CacheEvict
import org.springframework.http.MediaType
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

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

    data class AdminProfileBootstrapResponse(
        val member: AuthSessionMemberDto,
        val workspace: MemberProfileWorkspaceResponseDto,
    )

    data class ProfileImageHistoryResponse(
        val images: List<ProfileImageHistoryDto>,
    )

    private enum class LinkSection(
        val displayName: String,
        val defaultIcon: String,
        val allowedIcons: Set<String>,
    ) {
        SERVICE("serviceLinks", PROFILE_SERVICE_LINK_ICON_DEFAULT_VALUE, PROFILE_SERVICE_ICON_ALLOWED),
        CONTACT("contactLinks", PROFILE_CONTACT_LINK_ICON_DEFAULT_VALUE, PROFILE_CONTACT_ICON_ALLOWED),
    }

    private fun requireAuthenticatedMemberId(
        requestedId: Long,
        securityUser: SecurityUser,
    ): Long {
        if (requestedId != securityUser.id) {
            throw AppException(ErrorCode.ACCESS_DENIED, "권한이 없습니다.")
        }
        return securityUser.id
    }

    data class UpdateProfileIdentityRequest(
        @field:NotBlank
        @field:Size(min = 2, max = 30)
        val nickname: String,
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

    data class ProfileWorkspaceProjectRequest(
        @field:Size(max = 80)
        val id: String = "",
        @field:Size(max = 120)
        val name: String = "",
        @field:Size(max = 500)
        val summary: String = "",
        @field:Size(max = 120)
        val role: String = "",
        @field:Size(max = 2000)
        val href: String = "",
        @field:Size(max = 80)
        val linkLabel: String = "",
    )

    data class UpdateProfileWorkspaceDraftRequest(
        @field:Size(max = 2000)
        val profileImageUrl: String = "",
        @field:Size(max = 100)
        val profileRole: String = "",
        @field:Size(max = 1000)
        val profileBio: String = "",
        @field:Size(max = 200)
        val aboutHeadline: String = "",
        @field:Size(max = 100)
        val aboutRole: String = "",
        @field:Size(max = 2000)
        val aboutBio: String = "",
        @field:Size(max = 20)
        val aboutSections: List<@Valid ProfileWorkspaceSectionRequest> = emptyList(),
        @field:Size(max = 120)
        val aboutProjectSectionTitle: String = "",
        @field:Size(max = 20)
        val aboutProjects: List<@Valid ProfileWorkspaceProjectRequest> = emptyList(),
        @field:Size(max = 120)
        val blogTitle: String = "",
        @field:Size(max = 120)
        val homeIntroTitle: String = "",
        @field:Size(max = 500)
        val homeIntroDescription: String = "",
        @field:Size(max = 20)
        val blogDesign: String,
        @field:Size(max = 20)
        val legacyBlogScheme: String,
        @field:Size(max = 30)
        val serviceLinks: List<@Valid ProfileCardLinkItemRequest> = emptyList(),
        @field:Size(max = 30)
        val contactLinks: List<@Valid ProfileCardLinkItemRequest> = emptyList(),
    )

    @GetMapping("/bootstrap")
    @Transactional(readOnly = true)
    fun bootstrap(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): AdminHubBootstrapResponse =
        AdminHubBootstrapResponse(
            member = AuthSessionMemberDto(securityUser),
            profile = currentMemberProfileQueryUseCase.getPublishedById(securityUser.id),
        )

    @GetMapping("/profile/bootstrap")
    @Transactional(readOnly = true)
    fun profileBootstrap(
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): AdminProfileBootstrapResponse =
        AdminProfileBootstrapResponse(
            member = AuthSessionMemberDto(securityUser),
            workspace = currentMemberProfileQueryUseCase.getWorkspaceById(securityUser.id),
        )

    @GetMapping("/{id}/profileWorkspace")
    @Transactional(readOnly = true)
    fun getProfileWorkspace(
        @PathVariable
        @Positive
        id: Long,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): MemberProfileWorkspaceResponseDto {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        return currentMemberProfileQueryUseCase.getWorkspaceById(memberId)
    }

    @PostMapping("/{id}/profileImageFile", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Transactional
    fun uploadProfileImageFile(
        @PathVariable
        @Positive
        id: Long,
        @RequestPart("file") file: MultipartFile,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): ProfileImageUploadResponse {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        if (file.isEmpty) {
            throw AppException(ErrorCode.BAD_REQUEST, "이미지 파일이 비어 있습니다.")
        }
        val maxAllowedBytes = minOf(PROFILE_IMAGE_MAX_FILE_SIZE_BYTES, postImageStorageProperties.maxFileSizeBytes)
        if (file.size > maxAllowedBytes) {
            val limitMb = (maxAllowedBytes + (1024 * 1024) - 1) / (1024 * 1024)
            throw AppException(ErrorCode.PAYLOAD_TOO_LARGE, "이미지 파일은 ${limitMb}MB 이하여야 합니다.")
        }

        val uploadRequest =
            PostImageStoragePort.UploadImageRequest(
                inputStream = file.inputStream,
                contentLength = file.size,
                contentType = file.contentType,
                originalFilename = file.originalFilename,
            )
        val key = postImageStorageService.uploadPostImage(uploadRequest)
        uploadedFileRetentionService.registerTempUploadWithCompensation(
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
        return ProfileImageUploadResponse(imageUrl)
    }

    @GetMapping("/{id}/profileImageFiles")
    @Transactional(readOnly = true)
    fun listProfileImageFiles(
        @PathVariable
        @Positive
        id: Long,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): ProfileImageHistoryResponse {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        val member = memberUseCase.findById(memberId).orElseThrow()
        return ProfileImageHistoryResponse(
            images =
                uploadedFileRetentionService.listProfileImages(
                    memberId = memberId,
                    protectedProfileImgUrls = member.protectedProfileImgUrls(),
                ),
        )
    }

    @DeleteMapping("/{id}/profileImageFiles/{fileId}")
    @Transactional
    fun deleteProfileImageFile(
        @PathVariable
        @Positive
        id: Long,
        @PathVariable
        @Positive
        fileId: Long,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): RsData<Void> {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        val member = memberUseCase.findById(memberId).orElseThrow()
        uploadedFileRetentionService.deleteProfileImage(
            memberId = memberId,
            fileId = fileId,
            protectedProfileImgUrls = member.protectedProfileImgUrls(),
        )
        return RsData("200-1", "프로필 이미지가 삭제되었습니다.")
    }

    private fun Member.protectedProfileImgUrls(): List<String?> =
        listOf(
            getProfileWorkspaceDraftContent().profileImageUrl,
            getProfileWorkspacePublishedContent().profileImageUrl,
        )

    /**
     * 관리자 표시 이름(nickname)을 수정한다.
     */
    @PatchMapping("/{id}/nickname")
    @Transactional
    @CacheEvict(cacheNames = [ApiV1MemberController.ADMIN_PROFILE_CACHE_NAME], allEntries = true)
    fun updateProfileIdentity(
        @PathVariable
        @Positive
        id: Long,
        @RequestBody @Valid reqBody: UpdateProfileIdentityRequest,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): MemberWithUsernameDto {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        val member = memberUseCase.findById(memberId).orElseThrow()
        memberUseCase.modify(member, reqBody.nickname.trim())
        return currentMemberProfileQueryUseCase.getPublishedById(memberId)
    }

    @PutMapping("/{id}/profileWorkspace/draft")
    @Transactional
    fun saveProfileWorkspaceDraft(
        @PathVariable
        @Positive
        id: Long,
        @RequestBody @Valid reqBody: UpdateProfileWorkspaceDraftRequest,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): MemberProfileWorkspaceResponseDto {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        val member = memberUseCase.findById(memberId).orElseThrow()
        memberUseCase.saveProfileWorkspaceDraft(member, reqBody.toDomain())
        return currentMemberProfileQueryUseCase.getWorkspaceById(memberId)
    }

    @PostMapping("/{id}/profileWorkspace/publish")
    @Transactional
    @CacheEvict(cacheNames = [ApiV1MemberController.ADMIN_PROFILE_CACHE_NAME], allEntries = true)
    fun publishProfileWorkspace(
        @PathVariable
        @Positive
        id: Long,
        @AuthenticationPrincipal securityUser: SecurityUser,
    ): MemberProfileWorkspaceResponseDto {
        val memberId = requireAuthenticatedMemberId(id, securityUser)
        val member = memberUseCase.findById(memberId).orElseThrow()
        memberUseCase.publishProfileWorkspace(member)
        return currentMemberProfileQueryUseCase.getWorkspaceById(memberId)
    }

    private fun List<ProfileCardLinkItemRequest>.normalize(section: LinkSection): List<MemberProfileLinkItem> =
        mapIndexed { index, link ->
            val normalizedIcon = link.icon.trim().ifBlank { section.defaultIcon }
            if (normalizedIcon !in section.allowedIcons) {
                throw AppException(
                    ErrorCode.BAD_REQUEST,
                    "${section.displayName}[$index].icon 값이 유효하지 않습니다: $normalizedIcon",
                )
            }

            MemberProfileLinkItem(
                icon = normalizedIcon,
                label = link.label.trim(),
                href =
                    normalizeProfileLinkHref(link.href)
                        ?: throw AppException(
                            ErrorCode.BAD_REQUEST,
                            "${section.displayName}[$index].href 값이 유효하지 않습니다.",
                        ),
            )
        }

    private fun UpdateProfileWorkspaceDraftRequest.toDomain(): MemberProfileWorkspaceContent =
        MemberProfileWorkspaceContent(
            profileImageUrl = profileImageUrl.trim(),
            profileRole = profileRole.trim(),
            profileBio = profileBio.trim(),
            aboutHeadline = aboutHeadline.trim(),
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
            aboutProjectSectionTitle = aboutProjectSectionTitle.trim(),
            aboutProjects =
                aboutProjects.map {
                    MemberProfileAboutProjectBlock(
                        id = it.id.trim(),
                        name = it.name.trim(),
                        summary = it.summary.trim(),
                        role = it.role.trim(),
                        href = it.href.trim(),
                        linkLabel = it.linkLabel.trim(),
                    )
                },
            blogTitle = blogTitle.trim(),
            homeIntroTitle = homeIntroTitle.trim(),
            homeIntroDescription = homeIntroDescription.trim(),
            blogDesign = blogDesign.trim(),
            legacyBlogScheme = legacyBlogScheme.trim(),
            serviceLinks = serviceLinks.normalize(LinkSection.SERVICE),
            contactLinks = contactLinks.normalize(LinkSection.CONTACT),
        )

    data class ProfileImageUploadResponse(
        val profileImageUrl: String,
    )
}
