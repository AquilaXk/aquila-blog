package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.member.dto.MemberProfileWorkspaceContentDto
import com.back.boundedContexts.member.dto.MemberProfileWorkspaceResponseDto
import com.back.boundedContexts.member.dto.MemberWithUsernameDto
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.ProfileImageHistoryDto
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import com.back.support.BaseAdmMemberControllerWebMvcTest
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant
import java.util.Optional

@org.junit.jupiter.api.DisplayName("ApiV1AdmMemberControllerWebMvc 테스트")
class ApiV1AdmMemberControllerWebMvcTest : BaseAdmMemberControllerWebMvcTest() {
    @Test
    fun `관리자는 자신의 프로필 작업공간을 조회한다`() {
        val member = sampleAdmin(id = 7)
        val content = MemberProfileWorkspaceContentDto(member.getProfileWorkspaceDraftContent())
        val workspace =
            MemberProfileWorkspaceResponseDto(
                draft = content,
                published = content,
                lastDraftSavedAt = null,
                lastPublishedAt = null,
                dirtyFromPublished = false,
            )
        given(currentMemberProfileQueryUseCase.getWorkspaceById(7)).willReturn(workspace)

        mvc
            .perform(
                get("/member/api/v1/adm/members/7/profileWorkspace")
                    .with(user(adminUser(id = 7))),
            ).andExpect(status().isOk)
            .andExpect(handler().handlerType(ApiV1AdmMemberController::class.java))
            .andExpect(handler().methodName("getProfileWorkspace"))
            .andExpect(jsonPath("$.dirtyFromPublished").value(false))

        then(currentMemberProfileQueryUseCase).should().getWorkspaceById(7)
    }

    @Test
    fun `관리자는 자신의 프로필 이미지 파일을 업로드한다`() {
        val member = sampleAdmin(id = 7)
        val response = MemberWithUsernameDto(member)
        val file = MockMultipartFile("file", "profile.png", "image/png", byteArrayOf(1, 2, 3))
        val objectKey = "profile/admin avatar.png"
        val imageUrl = "http://localhost:8080/post/api/v1/images/profile/admin%20avatar.png"
        given(memberUseCase.findById(7)).willReturn(Optional.of(member))
        given(postImageStoragePort.uploadPostImage(anyUploadRequest())).willReturn(objectKey)
        given(currentMemberProfileQueryUseCase.getById(7)).willReturn(response)

        mvc
            .perform(
                multipart("/member/api/v1/adm/members/7/profileImageFile")
                    .file(file)
                    .with(user(adminUser(id = 7))),
            ).andExpect(status().isOk)
            .andExpect(handler().handlerType(ApiV1AdmMemberController::class.java))
            .andExpect(handler().methodName("uploadProfileImageFile"))
            .andExpect(jsonPath("$.id").value(7))

        then(uploadedFileRetentionService)
            .should()
            .registerTempUploadWithCompensation(
                objectKey = objectKey,
                contentType = "image/png",
                fileSize = 3,
                purpose = UploadedFilePurpose.PROFILE_IMAGE,
            )
        then(memberUseCase).should().modify(member, member.nickname, imageUrl)
        then(currentMemberProfileQueryUseCase).should().getById(7)
    }

    @Test
    fun `관리자 경로는 인증된 관리자와 다른 member id를 모든 side effect 전에 거부한다`() {
        val admin = adminUser(id = 7)
        val file = MockMultipartFile("file", "profile.png", "image/png", byteArrayOf(1))
        val requests =
            listOf(
                get("/member/api/v1/adm/members/8/profileWorkspace"),
                patch("/member/api/v1/adm/members/8/profileImgUrl")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"profileImgUrl":"https://example.com/profile.png"}"""),
                multipart("/member/api/v1/adm/members/8/profileImageFile").file(file),
                get("/member/api/v1/adm/members/8/profileImageFiles"),
                delete("/member/api/v1/adm/members/8/profileImageFiles/11"),
                patch("/member/api/v1/adm/members/8/nickname")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"nickname":"관리자"}"""),
                patch("/member/api/v1/adm/members/8/profileCard")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}"),
                put("/member/api/v1/adm/members/8/profileWorkspace/draft")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}"),
                post("/member/api/v1/adm/members/8/profileWorkspace/publish"),
            )

        requests.forEach { request ->
            mvc
                .perform(request.with(user(admin)))
                .andExpect(status().isForbidden)
                .andExpect(jsonPath("$.resultCode").value("403-1"))
        }

        then(memberUseCase).shouldHaveNoInteractions()
        then(currentMemberProfileQueryUseCase).shouldHaveNoInteractions()
        then(postImageStoragePort).shouldHaveNoInteractions()
        then(uploadedFileRetentionService).shouldHaveNoInteractions()
    }

    @Nested
    inner class ProfileImageFiles {
        @Test
        fun `관리자는 자신의 과거 프로필 이미지 목록을 조회한다`() {
            val member = sampleAdmin(id = 7)
            member.profileImgUrl = "http://localhost:8080/post/api/v1/images/profile/current.png"
            val protectedProfileImgUrls =
                listOf(member.profileImgUrl, member.getProfileWorkspacePublishedContent().profileImageUrl)
            given(memberUseCase.findById(7)).willReturn(Optional.of(member))
            given(uploadedFileRetentionService.listProfileImages(7, protectedProfileImgUrls))
                .willReturn(
                    listOf(
                        ProfileImageHistoryDto(
                            id = 11,
                            imageUrl = member.profileImgUrl,
                            objectKey = "profile/current.png",
                            contentType = "image/png",
                            fileSize = 100,
                            status = UploadedFileStatus.ACTIVE,
                            isCurrent = true,
                            createdAt = Instant.parse("2026-06-15T00:00:00Z"),
                            modifiedAt = Instant.parse("2026-06-15T00:01:00Z"),
                        ),
                    ),
                )

            mvc
                .perform(
                    get("/member/api/v1/adm/members/7/profileImageFiles")
                        .with(user(adminUser(id = 7))),
                ).andExpect(status().isOk)
                .andExpect(handler().handlerType(ApiV1AdmMemberController::class.java))
                .andExpect(handler().methodName("listProfileImageFiles"))
                .andExpect(jsonPath("$.images.length()").value(1))
                .andExpect(jsonPath("$.images[0].id").value(11))
                .andExpect(jsonPath("$.images[0].isCurrent").value(true))
        }

        @Test
        fun `관리자는 자신의 과거 프로필 이미지를 삭제한다`() {
            val member = sampleAdmin(id = 7)
            member.profileImgUrl = "http://localhost:8080/post/api/v1/images/profile/current.png"
            given(memberUseCase.findById(7)).willReturn(Optional.of(member))

            mvc
                .perform(
                    delete("/member/api/v1/adm/members/7/profileImageFiles/11")
                        .with(user(adminUser(id = 7))),
                ).andExpect(status().isOk)
                .andExpect(handler().handlerType(ApiV1AdmMemberController::class.java))
                .andExpect(handler().methodName("deleteProfileImageFile"))
                .andExpect(jsonPath("$.resultCode").value("200-1"))

            then(uploadedFileRetentionService)
                .should()
                .deleteProfileImage(
                    memberId = 7,
                    fileId = 11,
                    protectedProfileImgUrls =
                        listOf(member.profileImgUrl, member.getProfileWorkspacePublishedContent().profileImageUrl),
                )
        }
    }

    private fun adminUser(id: Long): SecurityUser =
        SecurityUser(
            id = id,
            username = "admin@example.com",
            password = "",
            nickname = "관리자",
            authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
        )

    private fun sampleAdmin(id: Long): Member =
        Member(
            id = id,
            username = "admin",
            password = null,
            nickname = "관리자",
            email = "admin@example.com",
        ).also {
            it.createdAt = Instant.parse("2026-03-13T00:00:00Z")
            it.modifiedAt = Instant.parse("2026-03-13T00:01:00Z")
            it.grantAdmin()
        }

    private fun anyUploadRequest(): PostImageStoragePort.UploadImageRequest =
        ArgumentMatchers.any(PostImageStoragePort.UploadImageRequest::class.java)
            ?: PostImageStoragePort.UploadImageRequest(
                inputStream = byteArrayOf().inputStream(),
                contentLength = 0,
                contentType = null,
                originalFilename = null,
            )
}
