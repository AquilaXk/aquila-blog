package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenDto
import com.back.boundedContexts.cloud.application.service.CloudFileContent
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadPartResultDto
import com.back.boundedContexts.cloud.application.service.CloudVideoUploadSessionDto
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.global.exception.application.AppException
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.UploadedFileUrlCodec
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.support.BaseAdmCloudControllerWebMvcTest
import jakarta.servlet.http.HttpServletRequest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.web.multipart.MultipartFile
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.time.Instant

private const val PDF_CONTENT_TYPE = "application/pdf"

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
                ownerMemberId = ArgumentMatchers.eq(7L),
                originalFilename = ArgumentMatchers.eq("photo.png"),
                clientOriginalFilename = ArgumentMatchers.eq("사진 원본.png"),
                contentType = ArgumentMatchers.eq("image/png"),
                inputStream = anyInputStream(),
                contentLength = ArgumentMatchers.eq(uploadBytes.size.toLong()),
                folderPath = ArgumentMatchers.eq("photos"),
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
    @DisplayName("관리자 upload는 MultipartFile bytes 복사 없이 stream으로 위임한다")
    fun `관리자 upload는 MultipartFile bytes 복사 없이 stream으로 위임한다`() {
        val item = sampleDto(id = 12L, ownerMemberId = 7L, originalFilename = "manual.pdf")
        given(
            cloudFileService.upload(
                ownerMemberId = ArgumentMatchers.eq(7L),
                originalFilename = ArgumentMatchers.eq("manual.pdf"),
                clientOriginalFilename = ArgumentMatchers.eq(null),
                contentType = ArgumentMatchers.eq(PDF_CONTENT_TYPE),
                inputStream = anyInputStream(),
                contentLength = ArgumentMatchers.eq(8L),
                folderPath = ArgumentMatchers.eq("docs"),
            ),
        ).willReturn(item)
        val controller =
            ApiV1AdmCloudController(
                cloudFileService,
                cloudVideoUploadSessionService,
                cloudExternalPlaybackTokenService,
            )

        val response =
            controller.upload(
                securityUser = adminUser(id = 7L),
                file = ByteAccessFailingMultipartFile("file", "manual.pdf", PDF_CONTENT_TYPE, "%PDF-1.7".toByteArray()),
                folderPath = "docs",
                clientFilename = null,
            )

        assertThat(response.statusCode).isEqualTo(HttpStatus.CREATED)
        then(cloudFileService).should().upload(
            ownerMemberId = ArgumentMatchers.eq(7L),
            originalFilename = ArgumentMatchers.eq("manual.pdf"),
            clientOriginalFilename = ArgumentMatchers.eq(null),
            contentType = ArgumentMatchers.eq(PDF_CONTENT_TYPE),
            inputStream = anyInputStream(),
            contentLength = ArgumentMatchers.eq(8L),
            folderPath = ArgumentMatchers.eq("docs"),
        )
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
                jsonPath("$.msg") { value("대용량 동영상 업로드를 시작했습니다.") }
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
                inputStream = anyInputStream(),
                contentLength = ArgumentMatchers.eq(chunkBytes.size.toLong()),
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
    @DisplayName("대용량 동영상 조각은 Content-Length가 없거나 0 이하일 때 즉시 거부한다")
    fun `대용량 동영상 조각은 Content-Length가 없거나 0 이하일 때 즉시 거부한다`() {
        val controller =
            ApiV1AdmCloudController(
                cloudFileService,
                cloudVideoUploadSessionService,
                cloudExternalPlaybackTokenService,
            )

        for (invalidLength in listOf(-1L, 0L)) {
            val request = mock(HttpServletRequest::class.java)
            given(request.contentLengthLong).willReturn(invalidLength)

            assertThatThrownBy {
                controller.uploadVideoPart(
                    securityUser = adminUser(id = 7L),
                    sessionId = 21L,
                    partNumber = 1,
                    request = request,
                )
            }.isInstanceOf(AppException::class.java)
                .hasMessageContaining("업로드 조각 크기가 올바르지 않습니다.")
        }

        then(cloudVideoUploadSessionService).shouldHaveNoInteractions()
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
                    contentPath = "/system/api/v1/public/cloud/files/12/playback?token=raw-token",
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
                    value("/system/api/v1/public/cloud/files/12/playback?token=raw-token")
                }
            }

        then(cloudExternalPlaybackTokenService).should().issue(ownerMemberId = 7L, fileId = 12L)
    }

    @Test
    @DisplayName("content HEAD는 DB 메타만으로 헤더를 반환하고 storage를 열지 않는다")
    fun `content HEAD는 DB 메타만으로 헤더를 반환하고 storage를 열지 않는다`() {
        val admin = adminUser(id = 7L)
        given(cloudFileService.get(ownerMemberId = 7L, fileId = 12L))
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

        mvc
            .perform(
                head("/system/api/v1/adm/cloud/files/12/content")
                    .with(user(admin)),
            ).andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
            .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, 2048L))
            .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "video/mp4"))
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(content().string(""))

        then(cloudFileService).should().get(ownerMemberId = 7L, fileId = 12L)
        then(cloudFileService).shouldHaveNoMoreInteractions()
        then(cloudExternalPlaybackTokenService).shouldHaveNoInteractions()
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
        val (_, file) = givenRangeContent(ownerMemberId = 7L, fileId = 12L, totalLength = 2048L, range = 0L..1023L, bytes = bytes)

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

        then(cloudFileService).should().get(ownerMemberId = 7L, fileId = 12L)
        then(cloudFileService).should().openContentRange(file = file, range = 0L..1023L)
        then(cloudFileService).should(never()).openContent(ownerMemberId = 7L, fileId = 12L)
    }

    @Test
    @DisplayName("content download=true 요청은 attachment Content-Disposition을 반환한다")
    fun `content download=true 요청은 attachment Content-Disposition을 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(
            ownerMemberId = 7L,
            fileId = 12L,
            bytes = "0123456789".toByteArray(),
            contentLength = 10L,
        )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content?download=true") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                header { string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"demo.mp4\"; filename*=UTF-8''demo.mp4") }
                content { bytes("0123456789".toByteArray()) }
            }
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
    @DisplayName("patch는 파일 이름과 폴더 경로 수정을 자신의 owner id로 service에 위임한다")
    fun `patch는 파일 이름과 폴더 경로 수정을 자신의 owner id로 service에 위임한다`() {
        val admin = adminUser(id = 7L)
        val updated =
            sampleDto(
                id = 12L,
                ownerMemberId = 7L,
                originalFilename = "새이름.pdf",
            ).copy(folderPath = "사진/여행")
        given(
            cloudFileService.updateFile(
                ownerMemberId = 7L,
                fileId = 12L,
                originalFilename = "새이름.pdf",
                folderPath = "사진/여행",
            ),
        ).willReturn(updated)

        mvc
            .patch("/system/api/v1/adm/cloud/files/12") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"originalFilename":"새이름.pdf","folderPath":"사진/여행"}"""
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.id") { value(12) }
                jsonPath("$.data.originalFilename") { value("새이름.pdf") }
                jsonPath("$.data.folderPath") { value("사진/여행") }
            }

        then(cloudFileService).should().updateFile(
            ownerMemberId = 7L,
            fileId = 12L,
            originalFilename = "새이름.pdf",
            folderPath = "사진/여행",
        )
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
    ): Pair<CloseAwareInputStream, CloudFileDto> {
        val inputStream = CloseAwareInputStream(bytes)
        val file = givenFileMetadata(ownerMemberId, fileId, totalLength, contentType)
        given(cloudFileService.openContentRange(file = file, range = range))
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
        return inputStream to file
    }

    private fun adminUser(id: Long): SecurityUser =
        SecurityUser(
            id = id,
            username = "admin$id@example.com",
            password = "",
            nickname = "관리자$id",
            authorities = listOf(SimpleGrantedAuthority("ROLE_ADMIN")),
        )

    @Test
    @DisplayName("관리자는 cloud 파일 facet 집계를 조회할 수 있다")
    fun `관리자는 cloud 파일 facet 집계를 조회할 수 있다`() {
        val admin = adminUser(id = 7L)
        val facets =
            ApiV1AdmCloudController.CloudFileFacetsResBody(
                allCount = 10L,
                allBytes = 102400L,
                photoCount = 5L,
                photoBytes = 51200L,
                videoCount = 3L,
                videoBytes = 40960L,
                documentCount = 2L,
                documentBytes = 10240L,
                folders = listOf("docs", "docs/2026", "photos"),
            )
        given(cloudFileService.getFacets(7L)).willReturn(facets)

        mvc
            .get("/system/api/v1/adm/cloud/files/facets") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.allCount") { value(10) }
                jsonPath("$.allBytes") { value(102400) }
                jsonPath("$.photoCount") { value(5) }
                jsonPath("$.photoBytes") { value(51200) }
                jsonPath("$.videoCount") { value(3) }
                jsonPath("$.videoBytes") { value(40960) }
                jsonPath("$.documentCount") { value(2) }
                jsonPath("$.documentBytes") { value(10240) }
                jsonPath("$.folders.length()") { value(3) }
                jsonPath("$.folders[0]") { value("docs") }
                jsonPath("$.folders[1]") { value("docs/2026") }
                jsonPath("$.folders[2]") { value("photos") }
            }

        then(cloudFileService).should().getFacets(7L)
        assertThat(
            ApiV1AdmCloudController
                .CloudFileFacetsResBody(
                    allCount = 0L,
                    allBytes = 0L,
                    photoCount = 0L,
                    photoBytes = 0L,
                    videoCount = 0L,
                    videoBytes = 0L,
                    documentCount = 0L,
                    documentBytes = 0L,
                ).folders,
        ).isEmpty()
    }

    @Test
    @DisplayName("관리자는 여러 cloud 파일을 일괄 삭제할 수 있다")
    fun `관리자는 여러 cloud 파일을 일괄 삭제할 수 있다`() {
        val admin = adminUser(id = 7L)
        val result =
            ApiV1AdmCloudController.BulkDeleteCloudFilesResBody(
                deletedIds = listOf(10L, 20L),
                deletedCount = 2,
            )
        given(cloudFileService.bulkDelete(7L, listOf(10L, 20L))).willReturn(result)

        mvc
            .post("/system/api/v1/adm/cloud/files/bulk-delete") {
                with(user(admin))
                contentType = MediaType.APPLICATION_JSON
                content = """{"ids": [10, 20]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.deletedCount") { value(2) }
                jsonPath("$.data.deletedIds[0]") { value(10) }
                jsonPath("$.data.deletedIds[1]") { value(20) }
            }

        then(cloudFileService).should().bulkDelete(7L, listOf(10L, 20L))
    }

    @Test
    @DisplayName("관리자는 이미지 cloud 파일을 게시글 에셋으로 승격할 수 있다")
    fun `관리자는 이미지 cloud 파일을 게시글 에셋으로 승격할 수 있다`() {
        val admin = adminUser(id = 7L)
        val fileDto =
            sampleDto(
                id = 15L,
                ownerMemberId = 7L,
                originalFilename = "photo.png",
                mediaKind = CloudFileMediaKind.PHOTO,
                byteSize = 2048L,
                contentType = "image/png",
            )
        given(cloudFileService.get(7L, 15L)).willReturn(fileDto)
        given(storageProperties.maxFileSizeBytes).willReturn(10L * 1024 * 1024)
        given(cloudFileService.openContent(7L, 15L)).willReturn(
            CloudFileContent(
                file = fileDto,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = ByteArrayInputStream("image-bytes".toByteArray()),
                        contentType = "image/png",
                        contentLength = 2048L,
                        originalFilename = "photo.png",
                    ),
            ),
        )
        given(postImageStorageService.uploadPostImage(anyUploadRequest())).willReturn("post-images/key-123.webp")

        mvc
            .post("/system/api/v1/adm/cloud/files/15/promote-post-asset") {
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.resultCode") { value("201-1") }
                jsonPath("$.msg") { value("게시글에 삽입할 이미지가 준비되었습니다.") }
                jsonPath("$.data.fileId") { value(15) }
                jsonPath("$.data.key") { value("post-images/key-123.webp") }
                jsonPath("$.data.url") { isNotEmpty() }
                jsonPath("$.data.markdown") { isNotEmpty() }
            }

        then(uploadedFileRetentionService).should().registerTempUploadWithCompensation(
            objectKey = "post-images/key-123.webp",
            contentType = "image/png",
            fileSize = 2048L,
            purpose = com.back.global.storage.domain.UploadedFilePurpose.POST_IMAGE,
        )
    }

    @Test
    @DisplayName("관리자는 이미지가 아닌 cloud 파일을 게시글 에셋으로 승격 시 400 에러를 반환한다")
    fun `관리자는 이미지가 아닌 cloud 파일을 게시글 에셋으로 승격 시 400 에러를 반환한다`() {
        val admin = adminUser(id = 7L)
        val fileDto =
            sampleDto(
                id = 15L,
                ownerMemberId = 7L,
                originalFilename = "doc.pdf",
                mediaKind = CloudFileMediaKind.DOCUMENT,
                byteSize = 2048L,
                contentType = "application/pdf",
            )
        given(cloudFileService.get(7L, 15L)).willReturn(fileDto)

        mvc
            .post("/system/api/v1/adm/cloud/files/15/promote-post-asset") {
                with(user(admin))
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.resultCode") { value("400-1") }
                jsonPath("$.msg") { value("이미지 파일만 게시글에 삽입할 수 있습니다.") }
            }
    }

    @Test
    @DisplayName("관리자는 허용 용량을 초과한 이미지를 게시글 에셋으로 승격 시 413 에러를 반환한다")
    fun `관리자는 허용 용량을 초과한 이미지를 게시글 에셋으로 승격 시 413 에러를 반환한다`() {
        val admin = adminUser(id = 7L)
        val oversizedImage =
            sampleDto(
                id = 16L,
                ownerMemberId = 7L,
                originalFilename = "huge.png",
                mediaKind = CloudFileMediaKind.PHOTO,
                byteSize = 9L * 1024 * 1024,
                contentType = "image/png",
            )
        given(cloudFileService.get(7L, 16L)).willReturn(oversizedImage)

        mvc
            .post("/system/api/v1/adm/cloud/files/16/promote-post-asset") {
                with(user(admin))
            }.andExpect {
                status { isContentTooLarge() }
                jsonPath("$.resultCode") { value("413-1") }
            }
    }

    @Test
    @DisplayName("게시글 에셋 승격은 스토리지 또는 보존 관리 서비스가 없으면 즉시 실패한다")
    fun `게시글 에셋 승격은 스토리지 또는 보존 관리 서비스가 없으면 즉시 실패한다`() {
        val admin = adminUser(id = 7L)
        val photoDto =
            sampleDto(
                id = 17L,
                ownerMemberId = 7L,
                originalFilename = "photo.png",
                mediaKind = CloudFileMediaKind.PHOTO,
                byteSize = 1024L,
                contentType = "image/png",
            )
        given(cloudFileService.get(7L, 17L)).willReturn(photoDto)

        val missingStorageController =
            ApiV1AdmCloudController(
                cloudFileService = cloudFileService,
                cloudVideoUploadSessionService = cloudVideoUploadSessionService,
                cloudExternalPlaybackTokenService = cloudExternalPlaybackTokenService,
                postImageStorageService = null,
                uploadedFileRetentionService = uploadedFileRetentionService,
            )
        assertThatThrownBy { missingStorageController.promotePostAsset(admin, 17L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("게시글 이미지 스토리지 서비스를 사용할 수 없습니다.")

        val missingRetentionController =
            ApiV1AdmCloudController(
                cloudFileService = cloudFileService,
                cloudVideoUploadSessionService = cloudVideoUploadSessionService,
                cloudExternalPlaybackTokenService = cloudExternalPlaybackTokenService,
                postImageStorageService = postImageStorageService,
                uploadedFileRetentionService = null,
            )
        assertThatThrownBy { missingRetentionController.promotePostAsset(admin, 17L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("업로드 보존 관리 서비스를 사용할 수 없습니다.")
    }

    @Test
    @DisplayName("관리자는 활성 외부 재생 토큰 목록을 조회할 수 있다")
    fun `관리자는 활성 외부 재생 토큰 목록을 조회할 수 있다`() {
        val admin = adminUser(id = 7L)
        val now = Instant.parse("2026-11-15T10:00:00Z")
        val tokens =
            listOf(
                com.back.boundedContexts.cloud.application.service.CloudExternalPlaybackTokenSummaryDto(
                    id = 101L,
                    fileId = 22L,
                    createdAt = now.minusSeconds(60),
                    expiresAt = now.plusSeconds(3600),
                ),
            )
        given(cloudExternalPlaybackTokenService.listActiveTokens(7L, 22L)).willReturn(tokens)

        mvc
            .get("/system/api/v1/adm/cloud/files/22/external-playback-tokens") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.tokens.length()") { value(1) }
                jsonPath("$.tokens[0].id") { value(101) }
                jsonPath("$.tokens[0].fileId") { value(22) }
            }

        then(cloudExternalPlaybackTokenService).should().listActiveTokens(7L, 22L)
    }

    @Test
    @DisplayName("관리자는 특정 외부 재생 토큰을 즉시 폐기할 수 있다")
    fun `관리자는 특정 외부 재생 토큰을 즉시 폐기할 수 있다`() {
        val admin = adminUser(id = 7L)

        mvc
            .delete("/system/api/v1/adm/cloud/files/22/external-playback-tokens/101") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
            }

        then(cloudExternalPlaybackTokenService).should().revokeToken(7L, 22L, 101L)
    }

    @Test
    @DisplayName("관리자는 특정 파일의 모든 외부 재생 토큰을 일괄 폐기할 수 있다")
    fun `관리자는 특정 파일의 모든 외부 재생 토큰을 일괄 폐기할 수 있다`() {
        val admin = adminUser(id = 7L)
        given(cloudExternalPlaybackTokenService.revokeAllTokens(7L, 22L)).willReturn(3)

        mvc
            .delete("/system/api/v1/adm/cloud/files/22/external-playback-tokens") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.data.revokedCount") { value(3) }
            }

        then(cloudExternalPlaybackTokenService).should().revokeAllTokens(7L, 22L)
    }

    private fun sampleDto(
        id: Long,
        ownerMemberId: Long,
        originalFilename: String,
        contentType: String = PDF_CONTENT_TYPE,
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

    @Test
    @DisplayName("관리자 content와 thumbnail은 checksumSha256 기반 ETag, 304, SVG CSP, share-links, 백슬래시 승격을 지원한다")
    fun `adm cloud etag 304 thumbnail csp share links and backslash promote`() {
        val admin = adminUser(id = 7L)
        val shaDto =
            CloudFileDto(
                id = 51L,
                ownerMemberId = 7L,
                originalFilename = "photo.png",
                contentType = "image/png",
                byteSize = 10L,
                mediaKind = CloudFileMediaKind.PHOTO,
                folderPath = "",
                createdAt = Instant.parse("2026-06-12T00:00:00Z"),
                modifiedAt = Instant.parse("2026-06-12T00:00:00Z"),
                checksumSha256 = "abc123",
            )
        given(cloudFileService.get(ownerMemberId = 7L, fileId = 51L)).willReturn(shaDto)
        given(cloudFileService.openContent(ownerMemberId = 7L, fileId = 51L)).willAnswer {
            CloudFileContent(
                file = shaDto,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = ByteArrayInputStream("0123456789".toByteArray()),
                        contentType = "image/png",
                        contentLength = 10L,
                        originalFilename = "photo.png",
                    ),
            )
        }

        mvc
            .get("/system/api/v1/adm/cloud/files/51/thumbnail") {
                header(HttpHeaders.IF_NONE_MATCH, "\"abc123-thumb\"")
                with(user(admin))
            }.andExpect {
                status { isNotModified() }
                header { string(HttpHeaders.ETAG, "\"abc123-thumb\"") }
                header { string(HttpHeaders.CACHE_CONTROL, "private, max-age=0, must-revalidate") }
            }
        then(cloudFileService).should(never()).openContent(ownerMemberId = 7L, fileId = 51L)

        mvc
            .get("/system/api/v1/adm/cloud/files/51/thumbnail") {
                with(user(admin))
            }.andExpect {
                status { isOk() }
                header { string(HttpHeaders.ETAG, "\"abc123-thumb\"") }
                header { string(HttpHeaders.CACHE_CONTROL, "private, max-age=0, must-revalidate") }
                header { stringValues("X-Content-Type-Options", "nosniff") }
                header { doesNotExist(HttpHeaders.ACCEPT_RANGES) }
            }

        mvc
            .get("/system/api/v1/adm/cloud/files/51/thumbnail") {
                header(HttpHeaders.RANGE, "bytes=0-3")
                with(user(admin))
            }.andExpect {
                status { isOk() }
                header { string(HttpHeaders.ETAG, "\"abc123-thumb\"") }
                header { string(HttpHeaders.CACHE_CONTROL, "private, max-age=0, must-revalidate") }
                header { doesNotExist(HttpHeaders.ACCEPT_RANGES) }
                header { doesNotExist(HttpHeaders.CONTENT_RANGE) }
                content { bytes("0123456789".toByteArray()) }
            }
        then(cloudFileService).should(never()).openContentRange(file = shaDto, range = 0L..3L)

        mvc
            .perform(head("/system/api/v1/adm/cloud/files/51/thumbnail").with(user(admin)))
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.ETAG, "\"abc123-thumb\""))
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, max-age=0, must-revalidate"))
            .andExpect(header().stringValues("X-Content-Type-Options", "nosniff"))
            .andExpect(header().doesNotExist(HttpHeaders.ACCEPT_RANGES))
            .andExpect(header().doesNotExist(HttpHeaders.CONTENT_LENGTH))

        mvc
            .perform(head("/system/api/v1/adm/cloud/files/51/content").with(user(admin)))
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.ETAG, "\"abc123\""))
            .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
            .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, 10L))
            .andExpect(header().stringValues("X-Content-Type-Options", "nosniff"))

        val svgDto = shaDto.copy(id = 52L, originalFilename = "a\\b[1].svg", contentType = "image/svg+xml")
        given(cloudFileService.get(ownerMemberId = 7L, fileId = 52L)).willReturn(svgDto)
        mvc
            .post("/system/api/v1/adm/cloud/files/52/promote-post-asset") {
                with(user(admin))
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.msg") { value("게시글 삽입은 JPEG·PNG·GIF·WebP 이미지만 지원합니다.") }
            }

        val slashPng = shaDto.copy(id = 53L, originalFilename = "a\\b[1].png")
        given(cloudFileService.get(ownerMemberId = 7L, fileId = 53L)).willReturn(slashPng)
        given(storageProperties.maxFileSizeBytes).willReturn(10L * 1024 * 1024)
        given(cloudFileService.openContent(7L, 53L)).willReturn(
            CloudFileContent(
                file = slashPng,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = ByteArrayInputStream(byteArrayOf(1, 2, 3)),
                        contentType = "image/png",
                        contentLength = 10L,
                        originalFilename = "a\\b[1].png",
                    ),
            ),
        )
        given(postImageStorageService.uploadPostImage(anyUploadRequest())).willReturn("post-images/k.webp")
        val expectedUrl = UploadedFileUrlCodec.buildImageUrl("post-images/k.webp")
        mvc
            .post("/system/api/v1/adm/cloud/files/53/promote-post-asset") {
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.markdown") { value("![a\\\\b\\[1\\].png]($expectedUrl)") }
            }

        given(cloudExternalPlaybackTokenService.issueShareLink(ownerMemberId = 7L, fileId = 52L, ttlSeconds = 86_400L))
            .willReturn(
                CloudExternalPlaybackTokenDto(
                    fileId = 52L,
                    token = "share-tok",
                    expiresAt = Instant.parse("2026-06-27T00:00:00Z"),
                    contentPath = "/system/api/v1/public/cloud/files/52/share?token=share-tok",
                ),
            )
        mvc
            .post("/system/api/v1/adm/cloud/files/52/share-links") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"ttlSeconds":86400}"""
                with(user(admin))
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.contentPath") { value("/system/api/v1/public/cloud/files/52/share?token=share-tok") }
            }

        given(cloudExternalPlaybackTokenService.listShareTokens(7L, 52L)).willReturn(emptyList())
        mvc.get("/system/api/v1/adm/cloud/files/52/share-links") { with(user(admin)) }.andExpect { status { isOk() } }

        mvc.delete("/system/api/v1/adm/cloud/files/52/share-links/99") { with(user(admin)) }.andExpect { status { isOk() } }
        then(cloudExternalPlaybackTokenService).should().revokeShareToken(7L, 52L, 99L)

        assertThat(
            mvc.post("/system/api/v1/adm/cloud/files/52/share-links") { with(user(admin)) },
        ).isNotNull()

        val badStream = CloseAwareInputStream("data".toByteArray())
        val rangeBadMimeDto = shaDto.copy(id = 54L, contentType = "invalid mime")
        given(cloudFileService.get(7L, 54L)).willReturn(rangeBadMimeDto)
        given(cloudFileService.openContentRange(file = rangeBadMimeDto, range = 0L..3L)).willReturn(
            CloudFileContent(
                file = rangeBadMimeDto,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = badStream,
                        contentType = "invalid mime",
                        contentLength = 4L,
                        originalFilename = "bad.bin",
                    ),
            ),
        )
        mvc
            .get("/system/api/v1/adm/cloud/files/54/content") {
                header(HttpHeaders.RANGE, "bytes=0-3")
                with(user(admin))
            }.andExpect { status { isInternalServerError() } }
        assertThat(badStream.closed).isTrue()

        given(cloudExternalPlaybackTokenService.revokeAllShareTokens(7L, 52L)).willReturn(2)
        mvc
            .delete("/system/api/v1/adm/cloud/files/52/share-links") { with(user(admin)) }
            .andExpect {
                status { isOk() }
                jsonPath("$.data.revokedCount") { value(2) }
            }
    }

    @Test
    @DisplayName("thumbnail HEAD는 Accept-Ranges와 원본 Content-Length를 생략하고, GET thumbnail은 Range 헤더를 무시해 썸네일을 반환한다")
    fun `thumbnail HEAD omits Accept-Ranges and byteSize and GET thumbnail ignores Range header`() {
        val admin = adminUser(id = 7L)
        val sourceImage = java.awt.image.BufferedImage(800, 600, java.awt.image.BufferedImage.TYPE_INT_RGB)
        val pngBytes =
            java.io.ByteArrayOutputStream().use { out ->
                javax.imageio.ImageIO.write(sourceImage, "png", out)
                out.toByteArray()
            }
        val photoDto =
            sampleDto(
                id = 55L,
                ownerMemberId = 7L,
                originalFilename = "large-photo.png",
                contentType = "image/png",
                byteSize = pngBytes.size.toLong(),
                mediaKind = CloudFileMediaKind.PHOTO,
            ).copy(checksumSha256 = "thumbsha55")
        given(cloudFileService.get(ownerMemberId = 7L, fileId = 55L)).willReturn(photoDto)
        given(cloudFileService.openContent(ownerMemberId = 7L, fileId = 55L)).willReturn(
            CloudFileContent(
                file = photoDto,
                storedObject =
                    CloudStoragePort.StoredObject(
                        inputStream = ByteArrayInputStream(pngBytes),
                        contentType = "image/png",
                        contentLength = pngBytes.size.toLong(),
                        originalFilename = "large-photo.png",
                    ),
            ),
        )

        mvc
            .perform(head("/system/api/v1/adm/cloud/files/55/thumbnail").with(user(admin)))
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "image/png"))
            .andExpect(header().string(HttpHeaders.ETAG, "\"thumbsha55-thumb\""))
            .andExpect(header().doesNotExist(HttpHeaders.ACCEPT_RANGES))
            .andExpect(header().doesNotExist(HttpHeaders.CONTENT_LENGTH))

        mvc
            .perform(head("/system/api/v1/adm/cloud/files/55/content").with(user(admin)))
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.ETAG, "\"thumbsha55\""))
            .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
            .andExpect(header().string(HttpHeaders.CONTENT_LENGTH, pngBytes.size.toString()))

        mvc
            .perform(head("/system/api/v1/adm/cloud/files/55/content").param("thumbnail", "true").with(user(admin)))
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.ETAG, "\"thumbsha55-thumb\""))
            .andExpect(header().doesNotExist(HttpHeaders.ACCEPT_RANGES))
            .andExpect(header().doesNotExist(HttpHeaders.CONTENT_LENGTH))

        val result =
            mvc
                .get("/system/api/v1/adm/cloud/files/55/thumbnail") {
                    header(HttpHeaders.RANGE, "bytes=0-15")
                    with(user(admin))
                }.andExpect {
                    status { isOk() }
                    header { string(HttpHeaders.ETAG, "\"thumbsha55-thumb\"") }
                    header { doesNotExist(HttpHeaders.ACCEPT_RANGES) }
                    header { doesNotExist(HttpHeaders.CONTENT_RANGE) }
                }.andReturn()

        assertThat(result.response.contentAsByteArray).isNotEmpty()
        assertThat(result.response.contentAsByteArray).isNotEqualTo(pngBytes.copyOfRange(0, 16))
        then(cloudFileService).should(never()).openContentRange(file = photoDto, range = 0L..15L)
    }

    private fun anyInputStream(): InputStream = ArgumentMatchers.any(InputStream::class.java) ?: ByteArrayInputStream(ByteArray(0))

    private fun anyUploadRequest(): PostImageStoragePort.UploadImageRequest =
        ArgumentMatchers.any(PostImageStoragePort.UploadImageRequest::class.java)
            ?: PostImageStoragePort.UploadImageRequest(
                inputStream = ByteArrayInputStream(ByteArray(0)),
                contentLength = 0L,
                contentType = "image/png",
                originalFilename = "dummy.png",
            )

    private class CloseAwareInputStream(
        bytes: ByteArray,
    ) : ByteArrayInputStream(bytes) {
        var closed: Boolean = false

        override fun close() {
            closed = true
            super.close()
        }
    }

    private class ByteAccessFailingMultipartFile(
        private val name: String,
        private val originalFilename: String,
        private val contentType: String,
        private val content: ByteArray,
    ) : MultipartFile {
        override fun getName(): String = name

        override fun getOriginalFilename(): String = originalFilename

        override fun getContentType(): String = contentType

        override fun isEmpty(): Boolean = content.isEmpty()

        override fun getSize(): Long = content.size.toLong()

        override fun getBytes(): ByteArray =
            throw AssertionError(
                "controller must pass upload content as stream without reading MultipartFile.bytes",
            )

        override fun getInputStream(): InputStream = ByteArrayInputStream(content)

        override fun transferTo(dest: java.io.File) {
            dest.outputStream().use { it.write(content) }
        }
    }
}
