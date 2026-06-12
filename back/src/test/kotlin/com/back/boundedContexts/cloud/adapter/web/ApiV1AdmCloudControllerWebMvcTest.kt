package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudFileContent
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.application.service.CloudFileService
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.security.domain.SecurityUser
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.support.BaseAdmCloudControllerWebMvcTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.then
import org.mockito.Mockito.mock
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.util.ReflectionTestUtils
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.multipart
import java.io.ByteArrayInputStream
import java.io.EOFException
import java.io.InputStream
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
    @DisplayName("content Range 요청은 private partial response를 반환한다")
    fun `content Range 요청은 private partial response를 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(ownerMemberId = 7L, fileId = 12L, bytes = "0123456789".toByteArray(), contentLength = 10L)

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
    @DisplayName("content suffix Range 요청은 마지막 byte 구간을 반환한다")
    fun `content suffix Range 요청은 마지막 byte 구간을 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(ownerMemberId = 7L, fileId = 12L, bytes = "0123456789".toByteArray(), contentLength = 10L)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=-4")
                with(user(admin))
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 6-9/10") }
                content { bytes("6789".toByteArray()) }
            }
    }

    @Test
    @DisplayName("content open-ended Range 요청은 끝까지 반환한다")
    fun `content open-ended Range 요청은 끝까지 반환한다`() {
        val admin = adminUser(id = 7L)
        givenContent(ownerMemberId = 7L, fileId = 12L, bytes = "0123456789".toByteArray(), contentLength = 10L)

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=7-")
                with(user(admin))
            }.andExpect {
                status { isPartialContent() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes 7-9/10") }
                content { bytes("789".toByteArray()) }
            }
    }

    @Test
    @DisplayName("content Range 요청은 stream 길이를 모르면 416을 반환하고 stream을 닫는다")
    fun `content Range 요청은 stream 길이를 모르면 416을 반환하고 stream을 닫는다`() {
        val admin = adminUser(id = 7L)
        val inputStream =
            givenContent(
                ownerMemberId = 7L,
                fileId = 12L,
                bytes = "0123456789".toByteArray(),
                contentLength = null,
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=0-1")
                with(user(admin))
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */*") }
            }

        assertThat(inputStream.closed).isTrue()
    }

    @Test
    @DisplayName("content Range 요청은 multi-range를 거절하고 stream을 닫는다")
    fun `content Range 요청은 multi-range를 거절하고 stream을 닫는다`() {
        val admin = adminUser(id = 7L)
        val inputStream =
            givenContent(
                ownerMemberId = 7L,
                fileId = 12L,
                bytes = "0123456789".toByteArray(),
                contentLength = 10L,
            )

        mvc
            .get("/system/api/v1/adm/cloud/files/12/content") {
                header(HttpHeaders.RANGE, "bytes=0-1,3-4")
                with(user(admin))
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */10") }
            }

        assertThat(inputStream.closed).isTrue()
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
    @DisplayName("slice stream은 단일 byte read에서도 지정된 구간만 반환한다")
    fun `slice stream은 단일 byte read에서도 지정된 구간만 반환한다`() {
        val controller = ApiV1AdmCloudController(mock(CloudFileService::class.java))
        val stream =
            ReflectionTestUtils.invokeMethod<InputStream>(
                controller,
                "sliceStream",
                ByteArrayInputStream("0123456789".toByteArray()),
                2L..4L,
            )!!

        val values = generateSequence { stream.read().takeIf { it >= 0 } }.toList()
        stream.close()

        assertThat(values).containsExactly('2'.code, '3'.code, '4'.code)
    }

    @Test
    @DisplayName("slice stream은 시작 위치까지 건너뛰지 못하면 EOF로 실패한다")
    fun `slice stream은 시작 위치까지 건너뛰지 못하면 EOF로 실패한다`() {
        val controller = ApiV1AdmCloudController(mock(CloudFileService::class.java))

        assertThatThrownBy {
            ReflectionTestUtils.invokeMethod<InputStream>(
                controller,
                "sliceStream",
                ByteArrayInputStream("abc".toByteArray()),
                5L..6L,
            )
        }.rootCause()
            .isInstanceOf(EOFException::class.java)
    }

    @Test
    @DisplayName("slice stream은 skip이 0이면 read로 건너뛰기를 이어간다")
    fun `slice stream은 skip이 0이면 read로 건너뛰기를 이어간다`() {
        val controller = ApiV1AdmCloudController(mock(CloudFileService::class.java))
        val stream =
            ReflectionTestUtils.invokeMethod<InputStream>(
                controller,
                "sliceStream",
                ZeroSkipInputStream("abc".toByteArray()),
                2L..2L,
            )!!

        assertThat(stream.read()).isEqualTo('c'.code)
        assertThat(stream.read()).isEqualTo(-1)
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

    private class CloseAwareInputStream(
        bytes: ByteArray,
    ) : ByteArrayInputStream(bytes) {
        var closed: Boolean = false

        override fun close() {
            closed = true
            super.close()
        }
    }

    private class ZeroSkipInputStream(
        bytes: ByteArray,
    ) : ByteArrayInputStream(bytes) {
        override fun skip(n: Long): Long = 0
    }
}
