package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudFileContent
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.support.BaseAdmCloudControllerWebMvcTest
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import java.io.ByteArrayInputStream
import java.time.Instant

@DisplayName("관리자 클라우드 WebMvc 테스트")
class ApiV1AdmCloudControllerWebMvcTest : BaseAdmCloudControllerWebMvcTest() {
    @Test
    @DisplayName("비로그인 사용자는 cloud 목록을 조회할 수 없다")
    fun `비로그인 사용자는 cloud 목록을 조회할 수 없다`() {
        mvc.get("/system/api/v1/adm/cloud/files").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
            jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
        }
    }

    @Test
    @WithMockUser(roles = ["USER"])
    @DisplayName("일반 사용자는 cloud 목록을 조회할 수 없다")
    fun `일반 사용자는 cloud 목록을 조회할 수 없다`() {
        mvc.get("/system/api/v1/adm/cloud/files").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
            jsonPath("$.msg") { value("권한이 없습니다.") }
        }
    }

    @Test
    @DisplayName("관리자는 자신의 cloud 파일 목록을 조회한다")
    fun `관리자는 자신의 cloud 파일 목록을 조회한다`() {
        val admin = adminUser(id = 7L)
        val item = sampleDto(id = 10L, ownerMemberId = 7L, originalFilename = "manual.pdf")
        given(cloudFileService.listFiles(7L, folderPath = null, keyword = "", mediaKind = null))
            .willReturn(listOf(item))

        mvc
            .get("/system/api/v1/adm/cloud/files") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.files.length()") { value(1) }
                jsonPath("$.files[0].id") { value(10) }
                jsonPath("$.files[0].ownerMemberId") { value(7) }
                jsonPath("$.files[0].originalFilename") { value("manual.pdf") }
            }

        then(cloudFileService).should().listFiles(7L, null, "", null)
    }

    @Test
    @DisplayName("관리자 upload는 자신의 owner id로 service에 위임한다")
    fun `관리자 upload는 자신의 owner id로 service에 위임한다`() {
        val admin = adminUser(id = 7L)
        val item = sampleDto(id = 11L, ownerMemberId = 7L, originalFilename = "photo.png", mediaKind = CloudFileMediaKind.PHOTO)
        val uploadBytes = "png".toByteArray()
        given(
            cloudFileService.upload(
                ownerMemberId = 7L,
                originalFilename = "photo.png",
                contentType = "image/png",
                bytes = uploadBytes,
                folderPath = "photos",
            ),
        ).willReturn(item)

        mvc
            .multipart("/system/api/v1/adm/cloud/files") {
                file(MockMultipartFile("file", "photo.png", MediaType.IMAGE_PNG_VALUE, uploadBytes))
                param("folderPath", "photos")
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.data.id") { value(11) }
                jsonPath("$.data.ownerMemberId") { value(7) }
            }
    }

    @Test
    @DisplayName("content Range 요청은 private partial response를 반환한다")
    fun `content Range 요청은 private partial response를 반환한다`() {
        val admin = adminUser(id = 7L)
        val file =
            sampleDto(
                id = 12L,
                ownerMemberId = 7L,
                originalFilename = "demo.mp4",
                contentType = "video/mp4",
                byteSize = 10L,
                mediaKind = CloudFileMediaKind.VIDEO,
            )
        given(cloudFileService.openContent(ownerMemberId = 7L, fileId = 12L))
            .willReturn(
                CloudFileContent(
                    file = file,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream("0123456789".toByteArray()),
                            contentType = "video/mp4",
                            contentLength = 10L,
                            originalFilename = "demo.mp4",
                        ),
                ),
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=2-5")
                with(user(admin))
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.ACCEPT_RANGES, "bytes") }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 2-5/10") }
                header { string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0") }
                content { contentType("video/mp4") }
                content { bytes("2345".toByteArray()) }
            }
    }

    @Test
    @DisplayName("delete는 자신의 owner id로 service에 위임한다")
    fun `delete는 자신의 owner id로 service에 위임한다`() {
        val admin = adminUser(id = 7L)

        mvc
            .delete("/system/api/v1/adm/cloud/files/12") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }

        then(cloudFileService).should().delete(ownerMemberId = 7L, fileId = 12L)
    }

    private fun adminUser(id: Long): SecurityUser =
        SecurityUser(
            id = id,
            username = "admin$id@example.com",
            password = "",
            nickname = "관리자$id",
            authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
        )

    private fun sampleDto(
        id: Long,
        ownerMemberId: Long,
        originalFilename: String,
        contentType: String = "application/pdf",
        byteSize: Long = 9L,
        mediaKind: CloudFileMediaKind = CloudFileMediaKind.DOCUMENT,
    ): CloudFileDto =
        CloudFileDto(
            id = id,
            ownerMemberId = ownerMemberId,
            originalFilename = originalFilename,
            contentType = contentType,
            byteSize = byteSize,
            mediaKind = mediaKind,
            folderPath = "",
            createdAt = Instant.parse("2026-06-12T00:00:00Z"),
            modifiedAt = Instant.parse("2026-06-12T00:00:00Z"),
        )
}
