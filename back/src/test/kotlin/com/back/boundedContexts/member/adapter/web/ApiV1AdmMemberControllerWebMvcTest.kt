package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.ProfileImageHistoryDto
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import com.back.standard.util.Ut
import com.back.support.BaseAdmMemberControllerWebMvcTest
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.Optional

@org.junit.jupiter.api.DisplayName("ApiV1AdmMemberControllerWebMvc 테스트")
class ApiV1AdmMemberControllerWebMvcTest : BaseAdmMemberControllerWebMvcTest() {
    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @BeforeEach
    fun initializeWorkspaceSerialization() {
        // 다른 테스트의 전역 초기화 순서에 의존하지 않는다.
        Ut.JSON.objectMapper = objectMapper
    }

    @Test
    fun `hub bootstrap serializes the authenticated member and canonical published profile`() {
        val member = sampleAdmin(7, "https://example.com/draft.png", "https://example.com/published.png")
        val profile = MemberWithUsernameDto(member, member.getProfileWorkspacePublishedContent(), Instant.EPOCH)
        given(currentMemberProfileQueryUseCase.getPublishedById(7)).willReturn(profile)

        mvc
            .perform(get("/member/api/v1/adm/members/bootstrap").with(user(adminUser(7))))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.member.id").value(7))
            .andExpect(jsonPath("$.member.isAdmin").value(true))
            .andExpect(jsonPath("$.profile.id").value(7))
            .andExpect(jsonPath("$.profile.nickname").value(member.nickname))
            .andExpect(jsonPath("$.profile.profileImageUrl").value("https://example.com/published.png?v=0"))
        then(memberUseCase).shouldHaveNoInteractions()
    }

    @Test
    fun `nickname patch validates request and passes trimmed input before returning canonical profile`() {
        val member = sampleAdmin(7, "", "")
        val profile = MemberWithUsernameDto(member, member.getProfileWorkspacePublishedContent(), Instant.EPOCH)
        given(memberUseCase.findById(7)).willReturn(Optional.of(member))
        given(currentMemberProfileQueryUseCase.getPublishedById(7)).willReturn(profile)

        mvc
            .perform(
                patch("/member/api/v1/adm/members/7/nickname")
                    .with(user(adminUser(7)))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"nickname":"  Aquila  "}"""),
            ).andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(profile.id))
            .andExpect(jsonPath("$.nickname").value(profile.nickname))
        then(memberUseCase).should().modify(member, "Aquila")
        then(currentMemberProfileQueryUseCase).should().getPublishedById(7)
    }

    @Test
    fun `nickname patch rejects blank input and another member without mutation`() {
        mvc
            .perform(
                patch("/member/api/v1/adm/members/7/nickname")
                    .with(user(adminUser(7)))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"nickname":"   "}"""),
            ).andExpect(status().isBadRequest)
        mvc
            .perform(
                patch("/member/api/v1/adm/members/8/nickname")
                    .with(user(adminUser(7)))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"nickname":"Aquila"}"""),
            ).andExpect(status().isForbidden)
        then(memberUseCase).shouldHaveNoInteractions()
        then(currentMemberProfileQueryUseCase).shouldHaveNoInteractions()
    }

    @Test
    fun `profile image upload returns only a URL without member mutation or profile query`() {
        val file = MockMultipartFile("file", "profile.png", "image/png", byteArrayOf(1, 2, 3))
        val objectKey = "profile/admin avatar.png"
        val imageUrl = "http://localhost:8080/post/api/v1/images/profile/admin%20avatar.png"
        given(postImageStoragePort.uploadPostImage(anyUploadRequest())).willReturn(objectKey)

        mvc
            .perform(
                multipart("/member/api/v1/adm/members/7/profileImageFile")
                    .file(file)
                    .with(user(adminUser(7))),
            ).andExpect(status().isOk)
            .andExpect(handler().methodName("uploadProfileImageFile"))
            .andExpect(jsonPath("$.profileImageUrl").value(imageUrl))

        then(uploadedFileRetentionService)
            .should()
            .registerTempUploadWithCompensation(objectKey, "image/png", 3, UploadedFilePurpose.PROFILE_IMAGE)
        then(memberUseCase).shouldHaveNoInteractions()
        then(currentMemberProfileQueryUseCase).shouldHaveNoInteractions()
    }

    @Test
    fun `canonical draft and published images are both protected from history deletion`() {
        val member = sampleAdmin(7, "https://example.com/draft.png", "https://example.com/published.png")
        val protected = listOf("https://example.com/draft.png", "https://example.com/published.png")
        given(memberUseCase.findById(7)).willReturn(Optional.of(member))
        given(uploadedFileRetentionService.listProfileImages(7, protected)).willReturn(
            listOf(
                ProfileImageHistoryDto(
                    11,
                    protected.first(),
                    "profile/draft.png",
                    "image/png",
                    100,
                    UploadedFileStatus.ACTIVE,
                    true,
                    Instant.EPOCH,
                    Instant.EPOCH,
                ),
            ),
        )

        mvc
            .perform(get("/member/api/v1/adm/members/7/profileImageFiles").with(user(adminUser(7))))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.images[0].isCurrent").value(true))
        mvc
            .perform(delete("/member/api/v1/adm/members/7/profileImageFiles/11").with(user(adminUser(7))))
            .andExpect(status().isOk)

        then(uploadedFileRetentionService).should().deleteProfileImage(7, 11, protected)
    }

    private fun adminUser(id: Long) = SecurityUser(id, "admin@example.com", "", "관리자", listOf(SimpleGrantedAuthority("ROLE_ADMIN")))

    private fun sampleAdmin(
        id: Long,
        draftImage: String,
        publishedImage: String,
    ): Member =
        Member(id, "admin", null, "관리자", "admin@example.com").also {
            it.createdAt = Instant.EPOCH
            it.modifiedAt = Instant.EPOCH
            it.grantAdmin()
            it.setProfileWorkspaceDraftContent(MemberProfileWorkspaceContent(profileImageUrl = draftImage))
            it.setProfileWorkspacePublishedContent(MemberProfileWorkspaceContent(profileImageUrl = publishedImage))
        }

    private fun anyUploadRequest(): PostImageStoragePort.UploadImageRequest =
        ArgumentMatchers.any(PostImageStoragePort.UploadImageRequest::class.java)
            ?: PostImageStoragePort.UploadImageRequest(byteArrayOf().inputStream(), 0, null, null)
}
