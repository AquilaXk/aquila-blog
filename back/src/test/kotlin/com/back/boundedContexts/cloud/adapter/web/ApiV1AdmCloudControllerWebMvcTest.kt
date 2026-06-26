package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenDto
import com.back.boundedContexts.cloud.application.service.CloudFileContent
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartResultDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionDto
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.support.BaseAdmCloudControllerWebMvcTest
import jakarta.servlet.http.HttpServletRequest
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.mock.web.DelegatingServletInputStream
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
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
    @DisplayName("관리자는 folder keyword mediaKind 조건으로 cloud 목록을 조회한다")
    fun `관리자는 folder keyword mediaKind 조건으로 cloud 목록을 조회한다`() {
        val admin = adminUser(id = 7L)
        given(cloudFileService.listFiles(7L, folderPath = "docs", keyword = "manual", mediaKind = CloudFileMediaKind.DOCUMENT))
            .willReturn(emptyList())

        mvc
            .get("/system/api/v1/adm/cloud/files") {
                param("folderPath", " docs ")
                param("kw", "manual")
                param("mediaKind", "DOCUMENT")
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.files.length()") { value(0) }
            }

        then(cloudFileService).should().listFiles(7L, "docs", "manual", CloudFileMediaKind.DOCUMENT)
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
                clientOriginalFilename = "사진 원본.png",
                contentType = "image/png",
                bytes = uploadBytes,
                folderPath = "photos",
            ),
        ).willReturn(item)

        mvc
            .multipart("/system/api/v1/adm/cloud/files") {
                file(MockMultipartFile("file", "photo.png", MediaType.IMAGE_PNG_VALUE, uploadBytes))
                param("folderPath", "photos")
                param("clientFilename", "사진 원본.png")
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.data.id") { value(11) }
                jsonPath("$.data.ownerMemberId") { value(7) }
            }
    }

    @Test
    @DisplayName("관리자는 대용량 동영상 업로드 세션을 생성한다")
    fun `관리자는 대용량 동영상 업로드 세션을 생성한다`() {
        val admin = adminUser(id = 7L)
        given(
            cloudVideoUploadSessionService.createSession(
                ownerMemberId = 7L,
                originalFilename = "demo.mp4",
                contentType = "video/mp4",
                byteSize = 5_368_709_120L,
                folderPath = "videos",
            ),
        ).willReturn(sampleVideoSessionDto())

        mvc
            .post("/system/api/v1/adm/cloud/files/video-upload-sessions") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "originalFilename": "demo.mp4",
                      "contentType": "video/mp4",
                      "byteSize": 5368709120,
                      "folderPath": "videos"
                    }
                    """.trimIndent()
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.data.id") { value(21) }
                jsonPath("$.data.totalParts") { value(80) }
            }
    }

    @Test
    @DisplayName("관리자는 folderPath를 생략해도 대용량 동영상 업로드 세션을 생성한다")
    fun `관리자는 folderPath 생략 요청으로 대용량 동영상 업로드 세션을 생성한다`() {
        val admin = adminUser(id = 7L)
        given(
            cloudVideoUploadSessionService.createSession(
                ownerMemberId = 7L,
                originalFilename = "demo.mp4",
                contentType = "video/mp4",
                byteSize = 5_368_709_120L,
                folderPath = "",
            ),
        ).willReturn(sampleVideoSessionDto().copy(folderPath = ""))

        mvc
            .post("/system/api/v1/adm/cloud/files/video-upload-sessions") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "originalFilename": "demo.mp4",
                      "contentType": "video/mp4",
                      "byteSize": 5368709120
                    }
                    """.trimIndent()
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.folderPath") { value("") }
            }
    }

    @Test
    @DisplayName("관리자는 대용량 동영상 업로드 세션 상태를 조회한다")
    fun `관리자는 대용량 동영상 업로드 세션 상태를 조회한다`() {
        val admin = adminUser(id = 7L)
        given(cloudVideoUploadSessionService.getSession(ownerMemberId = 7L, sessionId = 21L))
            .willReturn(sampleVideoSessionDto(uploadedParts = listOf(1, 2)))

        mvc
            .get("/system/api/v1/adm/cloud/files/video-upload-sessions/21") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(21) }
                jsonPath("$.uploadedParts[0]") { value(1) }
                jsonPath("$.uploadedParts[1]") { value(2) }
                jsonPath("$.completedFileId") { doesNotExist() }
            }
    }

    @Test
    @DisplayName("관리자는 대용량 동영상 조각을 raw body 그대로 업로드한다")
    fun `관리자는 대용량 동영상 조각을 raw body 그대로 업로드한다`() {
        val admin = adminUser(id = 7L)
        val chunkBytes = byteArrayOf(0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 1, 2, 3, 4)
        given(cloudVideoUploadSessionService.getSession(ownerMemberId = 7L, sessionId = 21L))
            .willReturn(sampleVideoSessionDto())
        given(
            cloudVideoUploadSessionService.uploadPart(
                ownerMemberId = ArgumentMatchers.eq(7L),
                sessionId = ArgumentMatchers.eq(21L),
                partNumber = ArgumentMatchers.eq(1),
                bytes = byteArrayContentEquals(chunkBytes),
            ),
        ).willReturn(
            CloudVideoUploadPartResultDto(
                session = sampleVideoSessionDto(uploadedParts = listOf(1)),
                part = CloudVideoUploadPartDto(partNumber = 1, byteSize = chunkBytes.size.toLong()),
            ),
        )

        mvc
            .put("/system/api/v1/adm/cloud/files/video-upload-sessions/21/parts/1") {
                contentType = MediaType.APPLICATION_OCTET_STREAM
                content = chunkBytes
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.session.uploadedParts[0]") { value(1) }
                jsonPath("$.part.partNumber") { value(1) }
            }
    }

    @Test
    @DisplayName("대용량 동영상 조각 body가 기대 크기를 넘으면 service 업로드 전에 거절한다")
    fun `대용량 동영상 조각 body가 기대 크기를 넘으면 service 업로드 전에 거절한다`() {
        val admin = adminUser(id = 7L)
        given(cloudVideoUploadSessionService.getSession(ownerMemberId = 7L, sessionId = 21L))
            .willReturn(
                sampleVideoSessionDto(
                    byteSize = 10,
                    partSizeBytes = 10,
                    totalParts = 1,
                ),
            )

        mvc
            .put("/system/api/v1/adm/cloud/files/video-upload-sessions/21/parts/1") {
                contentType = MediaType.APPLICATION_OCTET_STREAM
                content = ByteArray(11) { 1 }
                with(user(admin))
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.resultCode") { value("400-1") }
            }

        then(cloudVideoUploadSessionService).should().getSession(ownerMemberId = 7L, sessionId = 21L)
        then(cloudVideoUploadSessionService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("대용량 동영상 조각 번호가 세션 범위를 벗어나면 service 업로드 전에 거절한다")
    fun `대용량 동영상 조각 번호가 세션 범위를 벗어나면 service 업로드 전에 거절한다`() {
        val admin = adminUser(id = 7L)
        given(cloudVideoUploadSessionService.getSession(ownerMemberId = 7L, sessionId = 21L))
            .willReturn(sampleVideoSessionDto(totalParts = 1))

        mvc
            .put("/system/api/v1/adm/cloud/files/video-upload-sessions/21/parts/2") {
                contentType = MediaType.APPLICATION_OCTET_STREAM
                content = ByteArray(1) { 1 }
                with(user(admin))
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.resultCode") { value("400-1") }
            }

        then(cloudVideoUploadSessionService).should().getSession(ownerMemberId = 7L, sessionId = 21L)
        then(cloudVideoUploadSessionService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("대용량 동영상 조각 chunked body가 기대 크기를 넘으면 읽는 중 거절한다")
    fun `대용량 동영상 조각 chunked body가 기대 크기를 넘으면 읽는 중 거절한다`() {
        val request = mock(HttpServletRequest::class.java)
        given(request.contentLengthLong).willReturn(-1)
        given(request.inputStream)
            .willReturn(DelegatingServletInputStream(ByteArrayInputStream(ByteArray(11) { 1 })))
        given(cloudVideoUploadSessionService.getSession(ownerMemberId = 7L, sessionId = 21L))
            .willReturn(
                sampleVideoSessionDto(
                    byteSize = 10,
                    partSizeBytes = 10,
                    totalParts = 1,
                ),
            )

        val controller =
            ApiV1AdmCloudController(
                cloudFileService,
                cloudVideoUploadSessionService,
                cloudExternalPlaybackTokenService,
            )

        assertThatThrownBy {
            controller.uploadVideoPart(
                securityUser = adminUser(id = 7L),
                sessionId = 21L,
                partNumber = 1,
                request = request,
            )
        }.hasMessageContaining("업로드 조각 크기가 올바르지 않습니다.")

        then(cloudVideoUploadSessionService).should().getSession(ownerMemberId = 7L, sessionId = 21L)
        then(cloudVideoUploadSessionService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("관리자는 대용량 동영상 세션 완료와 취소를 owner id로 위임한다")
    fun `관리자는 대용량 동영상 세션 완료와 취소를 owner id로 위임한다`() {
        val admin = adminUser(id = 7L)
        val videoFile = sampleDto(id = 31L, ownerMemberId = 7L, originalFilename = "demo.mp4", mediaKind = CloudFileMediaKind.VIDEO)
        given(cloudVideoUploadSessionService.complete(ownerMemberId = 7L, sessionId = 21L)).willReturn(videoFile)

        mvc
            .post("/system/api/v1/adm/cloud/files/video-upload-sessions/21/complete") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.id") { value(31) }
            }

        mvc
            .delete("/system/api/v1/adm/cloud/files/video-upload-sessions/21") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }

        then(cloudVideoUploadSessionService).should().cancel(ownerMemberId = 7L, sessionId = 21L)
    }

    @Test
    @DisplayName("관리자는 자신의 cloud 파일 단건 metadata를 조회한다")
    fun `관리자는 자신의 cloud 파일 단건 metadata를 조회한다`() {
        val admin = adminUser(id = 7L)
        given(cloudFileService.get(ownerMemberId = 7L, fileId = 12L))
            .willReturn(sampleDto(id = 12L, ownerMemberId = 7L, originalFilename = "manual.pdf"))

        mvc
            .get("/system/api/v1/adm/cloud/files/12") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(12) }
                jsonPath("$.ownerMemberId") { value(7) }
                jsonPath("$.originalFilename") { value("manual.pdf") }
            }
    }

    @Test
    @DisplayName("관리자는 자신의 동영상 파일 외부 재생 token을 발급한다")
    fun `관리자는 자신의 동영상 파일 외부 재생 token을 발급한다`() {
        val admin = adminUser(id = 7L)
        given(cloudExternalPlaybackTokenService.issue(ownerMemberId = 7L, fileId = 12L))
            .willReturn(
                CloudExternalPlaybackTokenDto(
                    fileId = 12L,
                    token = "raw-token",
                    expiresAt = Instant.parse("2026-06-26T12:05:00Z"),
                    contentPath = "/system/api/v1/adm/cloud/files/12/external-content?token=raw-token",
                ),
            )

        mvc
            .post("/system/api/v1/adm/cloud/files/12/external-playback-token") {
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.data.fileId") { value(12) }
                jsonPath("$.data.token") { value("raw-token") }
                jsonPath("$.data.expiresAt") { value("2026-06-26T12:05:00Z") }
                jsonPath("$.data.contentPath") {
                    value("/system/api/v1/adm/cloud/files/12/external-content?token=raw-token")
                }
            }

        then(cloudExternalPlaybackTokenService).should().issue(ownerMemberId = 7L, fileId = 12L)
    }

    @Test
    @DisplayName("external content Range 요청은 cookie 없이 token으로 partial response를 반환한다")
    fun `external content Range 요청은 cookie 없이 token으로 partial response를 반환한다`() {
        val bytes = ByteArray(1024) { (it % 251).toByte() }
        given(cloudExternalPlaybackTokenService.getFile(token = "raw-token", fileId = 12L))
            .willReturn(
                sampleDto(
                    id = 12L,
                    ownerMemberId = 7L,
                    originalFilename = "demo.mp4",
                    contentType = "video/mp4",
                    mediaKind = CloudFileMediaKind.VIDEO,
                    byteSize = 2048L,
                ),
            )
        given(cloudExternalPlaybackTokenService.openContentRange(token = "raw-token", fileId = 12L, range = 0L..1023L))
            .willReturn(
                CloudFileContent(
                    file =
                        sampleDto(
                            id = 12L,
                            ownerMemberId = 7L,
                            originalFilename = "demo.mp4",
                            contentType = "video/mp4",
                            mediaKind = CloudFileMediaKind.VIDEO,
                            byteSize = 2048L,
                        ),
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream(bytes),
                            contentType = "video/mp4",
                            contentLength = 1024L,
                            originalFilename = "demo.mp4",
                        ),
                ),
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/external-content") {
                param("token", "raw-token")
                header(HttpHeaders.RANGE, "bytes=0-1023")
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.ACCEPT_RANGES, "bytes") }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 0-1023/2048") }
                header { longValue(HttpHeaders.CONTENT_LENGTH, 1024L) }
                header { string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0") }
                content { contentType("video/mp4") }
                content { bytes(bytes) }
            }

        then(cloudExternalPlaybackTokenService).should().getFile(token = "raw-token", fileId = 12L)
        then(cloudExternalPlaybackTokenService).should().openContentRange(token = "raw-token", fileId = 12L, range = 0L..1023L)
        then(cloudFileService).shouldHaveNoInteractions()
    }

    @Test
    @DisplayName("external content 일반 요청은 cookie 없이 token으로 full response를 반환한다")
    fun `external content 일반 요청은 cookie 없이 token으로 full response를 반환한다`() {
        val bytes = "0123456789".toByteArray()
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willReturn(
                CloudFileContent(
                    file =
                        sampleDto(
                            id = 12L,
                            ownerMemberId = 7L,
                            originalFilename = "demo.mp4",
                            contentType = "video/mp4",
                            mediaKind = CloudFileMediaKind.VIDEO,
                            byteSize = 10L,
                        ),
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream(bytes),
                            contentType = "video/mp4",
                            contentLength = 10L,
                            originalFilename = "demo.mp4",
                        ),
                ),
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/external-content") {
                param("token", "raw-token")
            }.andExpect {
                status { isOk() }
                header { string(HttpHeaders.ACCEPT_RANGES, "bytes") }
                header { longValue(HttpHeaders.CONTENT_LENGTH, 10L) }
                header { string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0") }
                content { contentType("video/mp4") }
                content { bytes(bytes) }
            }

        then(cloudExternalPlaybackTokenService).should().openContent(token = "raw-token", fileId = 12L)
        then(cloudFileService).shouldHaveNoInteractions()
    }

    @Test
    @DisplayName("external content 길이를 모르는 일반 요청은 content length 없이 반환한다")
    fun `external content 길이를 모르는 일반 요청은 content length 없이 반환한다`() {
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willReturn(
                CloudFileContent(
                    file =
                        sampleDto(
                            id = 12L,
                            ownerMemberId = 7L,
                            originalFilename = "demo.mp4",
                            contentType = "video/mp4",
                            mediaKind = CloudFileMediaKind.VIDEO,
                        ),
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = ByteArrayInputStream("abc".toByteArray()),
                            contentType = "video/mp4",
                            contentLength = null,
                            originalFilename = "demo.mp4",
                        ),
                ),
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/external-content") {
                param("token", "raw-token")
            }.andExpect {
                status { isOk() }
                content { bytes("abc".toByteArray()) }
            }
    }

    @Test
    @DisplayName("external content invalid Range 요청은 416을 반환하고 storage stream을 열지 않는다")
    fun `external content invalid Range 요청은 416을 반환하고 storage stream을 열지 않는다`() {
        given(cloudExternalPlaybackTokenService.getFile(token = "raw-token", fileId = 12L))
            .willReturn(
                sampleDto(
                    id = 12L,
                    ownerMemberId = 7L,
                    originalFilename = "demo.mp4",
                    contentType = "video/mp4",
                    mediaKind = CloudFileMediaKind.VIDEO,
                    byteSize = 10L,
                ),
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/external-content") {
                param("token", "raw-token")
                header(HttpHeaders.RANGE, "bytes=abc-def")
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */10") }
            }

        then(cloudExternalPlaybackTokenService).should().getFile(token = "raw-token", fileId = 12L)
        then(cloudExternalPlaybackTokenService).shouldHaveNoMoreInteractions()
        then(cloudFileService).shouldHaveNoInteractions()
    }

    @Test
    @DisplayName("content 일반 요청은 private full response를 반환한다")
    fun `content 일반 요청은 private full response를 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(
            ownerMemberId = 7L,
            fileId = 12L,
            bytes = "0123456789".toByteArray(),
            contentLength = 10L,
        )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                header { string(HttpHeaders.ACCEPT_RANGES, "bytes") }
                header { string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0") }
                header { string("X-Content-Type-Options", "nosniff") }
                content { bytes("0123456789".toByteArray()) }
            }
    }

    @Test
    @DisplayName("content 일반 요청은 길이를 모르는 stream도 반환한다")
    fun `content 일반 요청은 길이를 모르는 stream도 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(
            ownerMemberId = 7L,
            fileId = 12L,
            bytes = "abc".toByteArray(),
            contentLength = null,
        )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                content { bytes("abc".toByteArray()) }
            }
    }

    @Test
    @DisplayName("content Range bytes=0-1023 요청은 storage range stream으로 private partial response를 반환한다")
    fun `content Range bytes 0-1023 요청은 storage range stream으로 private partial response를 반환한다`() {
        val admin = adminUser(id = 7L)
        val bytes = ByteArray(1024) { (it % 251).toByte() }
        givenRangeContent(ownerMemberId = 7L, fileId = 12L, totalLength = 2048L, range = 0L..1023L, bytes = bytes)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=0-1023")
                with(user(admin))
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.ACCEPT_RANGES, "bytes") }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 0-1023/2048") }
                header { longValue(HttpHeaders.CONTENT_LENGTH, 1024L) }
                header { string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0") }
                content { contentType("video/mp4") }
                content { bytes(bytes) }
            }

        then(cloudFileService).should().openContentRange(ownerMemberId = 7L, fileId = 12L, range = 0L..1023L)
        then(cloudFileService).should(never()).openContent(ownerMemberId = 7L, fileId = 12L)
    }

    @Test
    @DisplayName("content Range bytes=1024- 요청은 끝까지 반환한다")
    fun `content Range bytes 1024 open ended 요청은 끝까지 반환한다`() {
        val admin = adminUser(id = 7L)
        val bytes = ByteArray(1024) { (it % 251).toByte() }
        givenRangeContent(ownerMemberId = 7L, fileId = 12L, totalLength = 2048L, range = 1024L..2047L, bytes = bytes)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=1024-")
                with(user(admin))
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 1024-2047/2048") }
                header { longValue(HttpHeaders.CONTENT_LENGTH, 1024L) }
                content { bytes(bytes) }
            }
    }

    @Test
    @DisplayName("content suffix Range bytes=-1024 요청은 total보다 크면 전체 길이로 clamp한다")
    fun `content suffix Range bytes minus 1024 요청은 total보다 크면 전체 길이로 clamp한다`() {
        val admin = adminUser(id = 7L)
        givenRangeContent(
            ownerMemberId = 7L,
            fileId = 12L,
            totalLength = 10L,
            range = 0L..9L,
            bytes = "0123456789".toByteArray(),
        )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=-1024")
                with(user(admin))
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 0-9/10") }
                header { longValue(HttpHeaders.CONTENT_LENGTH, 10L) }
                content { bytes("0123456789".toByteArray()) }
            }
    }

    @Test
    @DisplayName("content invalid Range 요청은 416을 반환하고 storage stream을 열지 않는다")
    fun `content invalid Range 요청은 416을 반환하고 storage stream을 열지 않는다`() {
        val admin = adminUser(id = 7L)
        givenFileMetadata(ownerMemberId = 7L, fileId = 12L, totalLength = 10L)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=abc-def")
                with(user(admin))
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */10") }
            }

        then(cloudFileService).should().get(ownerMemberId = 7L, fileId = 12L)
        then(cloudFileService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("content unsatisfiable Range 요청은 416을 반환하고 storage stream을 열지 않는다")
    fun `content unsatisfiable Range 요청은 416을 반환하고 storage stream을 열지 않는다`() {
        val admin = adminUser(id = 7L)
        givenFileMetadata(ownerMemberId = 7L, fileId = 12L, totalLength = 10L)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=10-")
                with(user(admin))
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */10") }
            }

        then(cloudFileService).should().get(ownerMemberId = 7L, fileId = 12L)
        then(cloudFileService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("content Range 요청은 multi-range를 거절하고 storage stream을 열지 않는다")
    fun `content Range 요청은 multi-range를 거절하고 storage stream을 열지 않는다`() {
        val admin = adminUser(id = 7L)
        givenFileMetadata(ownerMemberId = 7L, fileId = 12L, totalLength = 10L)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=0-1,3-4")
                with(user(admin))
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */10") }
            }

        then(cloudFileService).should().get(ownerMemberId = 7L, fileId = 12L)
        then(cloudFileService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("content 요청은 저장된 content type이 올바르지 않으면 500을 반환한다")
    fun `content 요청은 저장된 content type이 올바르지 않으면 500을 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(
            ownerMemberId = 7L,
            fileId = 12L,
            bytes = "body".toByteArray(),
            contentLength = 4L,
            contentType = "bad type",
        )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                with(user(admin))
            }.andExpect {
                status { isInternalServerError() }
                jsonPath("$.resultCode") { value("500-1") }
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

    private fun givenContent(
        ownerMemberId: Long,
        fileId: Long,
        bytes: ByteArray,
        contentLength: Long?,
        contentType: String = "video/mp4",
    ): CloseAwareInputStream {
        val inputStream = CloseAwareInputStream(bytes)
        val file =
            sampleDto(
                id = fileId,
                ownerMemberId = ownerMemberId,
                originalFilename = "demo.mp4",
                contentType = contentType,
                byteSize = bytes.size.toLong(),
                mediaKind = CloudFileMediaKind.VIDEO,
            )
        given(cloudFileService.openContent(ownerMemberId = ownerMemberId, fileId = fileId))
            .willReturn(
                CloudFileContent(
                    file = file,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = inputStream,
                            contentType = contentType,
                            contentLength = contentLength,
                            originalFilename = "demo.mp4",
                        ),
                ),
            )
        return inputStream
    }

    private fun givenFileMetadata(
        ownerMemberId: Long,
        fileId: Long,
        totalLength: Long,
        contentType: String = "video/mp4",
    ): CloudFileDto {
        val file =
            sampleDto(
                id = fileId,
                ownerMemberId = ownerMemberId,
                originalFilename = "demo.mp4",
                contentType = contentType,
                byteSize = totalLength,
                mediaKind = CloudFileMediaKind.VIDEO,
            )
        given(cloudFileService.get(ownerMemberId = ownerMemberId, fileId = fileId)).willReturn(file)
        return file
    }

    private fun givenRangeContent(
        ownerMemberId: Long,
        fileId: Long,
        totalLength: Long,
        range: LongRange,
        bytes: ByteArray,
        contentType: String = "video/mp4",
    ): CloseAwareInputStream {
        val inputStream = CloseAwareInputStream(bytes)
        val file = givenFileMetadata(ownerMemberId, fileId, totalLength, contentType)
        given(cloudFileService.openContentRange(ownerMemberId = ownerMemberId, fileId = fileId, range = range))
            .willReturn(
                CloudFileContent(
                    file = file,
                    storedObject =
                        CloudStoragePort.StoredObject(
                            inputStream = inputStream,
                            contentType = contentType,
                            contentLength = bytes.size.toLong(),
                            originalFilename = "demo.mp4",
                        ),
                ),
            )
        return inputStream
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

    private fun sampleVideoSessionDto(
        uploadedParts: List<Int> = emptyList(),
        byteSize: Long = 5_368_709_120L,
        partSizeBytes: Long = 67_108_864L,
        totalParts: Int = 80,
    ): CloudVideoUploadSessionDto =
        CloudVideoUploadSessionDto(
            id = 21L,
            ownerMemberId = 7L,
            originalFilename = "demo.mp4",
            contentType = "video/mp4",
            byteSize = byteSize,
            folderPath = "videos",
            partSizeBytes = partSizeBytes,
            totalParts = totalParts,
            uploadedParts = uploadedParts,
            status = CloudVideoUploadSessionStatus.IN_PROGRESS,
            expiresAt = Instant.parse("2026-06-18T00:00:00Z"),
            completedFileId = null,
            failureReason = null,
        )

    private fun byteArrayContentEquals(expected: ByteArray): ByteArray =
        ArgumentMatchers.argThat<ByteArray> { actual ->
            actual != null && actual.contentEquals(expected)
        } ?: ByteArray(0)

    private class CloseAwareInputStream(
        bytes: ByteArray,
    ) : ByteArrayInputStream(bytes) {
        var closed: Boolean = false

        override fun close() {
            closed = true
            super.close()
        }
    }
}
