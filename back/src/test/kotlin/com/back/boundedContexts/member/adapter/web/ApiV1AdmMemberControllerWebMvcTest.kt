package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.domain.shared.memberMixin.MemberProfileWorkspaceContent
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.ProfileImageHistoryDto
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import com.back.support.BaseAdmMemberControllerWebMvcTest
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant
import java.util.Optional

@org.junit.jupiter.api.DisplayName("ApiV1AdmMemberControllerWebMvc 테스트")
class ApiV1AdmMemberControllerWebMvcTest : BaseAdmMemberControllerWebMvcTest() {
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
