package com.back.boundedContexts.cloud.adapter.web

import com.back.boundedContexts.cloud.application.service.CloudFileContent
import com.back.boundedContexts.cloud.application.service.CloudFileDto
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.back.global.rsData.RsData
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.support.BasePublicCloudControllerWebMvcTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.doReturn
import org.mockito.BDDMockito.given
import org.mockito.BDDMockito.spy
import org.mockito.BDDMockito.then
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.io.ByteArrayInputStream
import java.time.Instant

@DisplayName("ApiV1PublicCloudController 테스트")
class ApiV1PublicCloudControllerWebMvcTest : BasePublicCloudControllerWebMvcTest() {
    private fun sampleDto(
        id: Long = 12L,
        ownerMemberId: Long = 7L,
        originalFilename: String = "demo.mp4",
        contentType: String = "video/mp4",
        mediaKind: CloudFileMediaKind = CloudFileMediaKind.VIDEO,
        byteSize: Long = 2048L,
        folderPath: String = "",
    ): CloudFileDto =
        CloudFileDto(
            id = id,
            ownerMemberId = ownerMemberId,
            originalFilename = originalFilename,
            contentType = contentType,
            byteSize = byteSize,
            mediaKind = mediaKind,
            folderPath = folderPath,
            createdAt = Instant.parse("2026-06-26T12:00:00Z"),
            modifiedAt = Instant.parse("2026-06-26T12:00:00Z"),
        )

    @Test
    @DisplayName("external playback Range 요청은 cookie 없이 token으로 partial response를 반환한다")
    fun `external playback Range 요청은 cookie 없이 token으로 partial response를 반환한다`() {
        val bytes = ByteArray(1024) { (it % 251).toByte() }
        given(cloudExternalPlaybackTokenService.getFile(token = "raw-token", fileId = 12L))
            .willReturn(sampleDto())
        given(cloudExternalPlaybackTokenService.openContentRange(token = "raw-token", fileId = 12L, range = 0L..1023L))
            .willReturn(
                CloudFileContent(
                    file = sampleDto(),
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
            .get("/system/api/v1/public/cloud/files/12/playback") {
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
    }

    @Test
    @DisplayName("external playback 일반 요청은 cookie 없이 token으로 full response를 반환한다")
    fun `external playback 일반 요청은 cookie 없이 token으로 full response를 반환한다`() {
        val bytes = "0123456789".toByteArray()
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willReturn(
                CloudFileContent(
                    file = sampleDto(byteSize = 10L),
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
            .get("/system/api/v1/public/cloud/files/12/playback") {
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
    }

    @Test
    @DisplayName("external playback 길이를 모르는 일반 요청은 content length 없이 반환한다")
    fun `external playback 길이를 모르는 일반 요청은 content length 없이 반환한다`() {
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willReturn(
                CloudFileContent(
                    file = sampleDto(),
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
            .get("/system/api/v1/public/cloud/files/12/playback") {
                param("token", "raw-token")
            }.andExpect {
                status { isOk() }
                content { bytes("abc".toByteArray()) }
            }
    }

    @Test
    @DisplayName("external playback AppException 4xx는 playback 메트릭 후 전파된다")
    fun `external playback AppException 4xx는 playback 메트릭 후 전파된다`() {
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willThrow(
                AppException(
                    ErrorCode.CLOUD_PLAYBACK_DENIED,
                    "외부 재생 token이 올바르지 않거나 만료되었습니다.",
                ),
            )

        mvc
            .get("/system/api/v1/public/cloud/files/12/playback") {
                param("token", "raw-token")
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.resultCode") { value("403-30") }
            }
    }

    @Test
    @DisplayName("external playback AppException 5xx는 playback 메트릭 후 전파된다")
    fun `external playback AppException 5xx는 playback 메트릭 후 전파된다`() {
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willThrow(AppException(ErrorCode.INTERNAL_ERROR, "분류되지 않은 오류"))

        val result =
            mvc
                .get("/system/api/v1/public/cloud/files/12/playback") {
                    param("token", "raw-token")
                }.andReturn()

        assertThat(result.resolvedException).isInstanceOf(AppException::class.java)
        assertThat((result.resolvedException as AppException).rsData.resultCode).isEqualTo("500-1")
    }

    @Test
    @DisplayName("external playback AppException other resultCode는 other playback 메트릭 후 전파된다")
    fun `external playback AppException other resultCode는 other playback 메트릭 후 전파된다`() {
        val ex = spy(AppException(ErrorCode.INTERNAL_ERROR, "분류되지 않은 응답 코드"))
        doReturn(RsData<Void>("200-99", "분류되지 않은 응답 코드")).`when`(ex).rsData
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willThrow(ex)

        val result =
            mvc
                .get("/system/api/v1/public/cloud/files/12/playback") {
                    param("token", "raw-token")
                }.andReturn()

        assertThat(result.resolvedException).isSameAs(ex)
        assertThat((result.resolvedException as AppException).rsData.resultCode).isEqualTo("200-99")
    }

    @Test
    @DisplayName("external playback RuntimeException은 5xx playback 메트릭 후 전파된다")
    fun `external playback RuntimeException은 5xx playback 메트릭 후 전파된다`() {
        given(cloudExternalPlaybackTokenService.openContent(token = "raw-token", fileId = 12L))
            .willThrow(IllegalStateException("boom"))

        val result =
            mvc
                .get("/system/api/v1/public/cloud/files/12/playback") {
                    param("token", "raw-token")
                }.andReturn()

        assertThat(result.resolvedException).isInstanceOf(IllegalStateException::class.java)
        assertThat(result.resolvedException?.message).isEqualTo("boom")
    }

    @Test
    @DisplayName("external playback invalid Range 요청은 416을 반환하고 storage stream을 열지 않는다")
    fun `external playback invalid Range 요청은 416을 반환하고 storage stream을 열지 않는다`() {
        given(cloudExternalPlaybackTokenService.getFile(token = "raw-token", fileId = 12L))
            .willReturn(sampleDto(byteSize = 10L))

        mvc
            .get("/system/api/v1/public/cloud/files/12/playback") {
                param("token", "raw-token")
                header(HttpHeaders.RANGE, "bytes=abc-def")
            }.andExpect {
                status { isRequestedRangeNotSatisfiable() }
                header { string(HttpHeaders.CONTENT_RANGE, "bytes */10") }
            }

        then(cloudExternalPlaybackTokenService).should().getFile(token = "raw-token", fileId = 12L)
        then(cloudExternalPlaybackTokenService).shouldHaveNoMoreInteractions()
    }

    @Test
    @DisplayName("external playback HEAD는 token 검증 후 DB 메타만으로 헤더를 반환하고 storage를 열지 않는다")
    fun `external playback HEAD는 token 검증 후 DB 메타만으로 헤더를 반환하고 storage를 열지 않는다`() {
        given(cloudExternalPlaybackTokenService.getFile(token = "raw-token", fileId = 12L))
            .willReturn(sampleDto(byteSize = 4096L))

        mvc
            .perform(
                head("/system/api/v1/public/cloud/files/12/playback")
                    .param("token", "raw-token"),
            ).andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.ACCEPT_RANGES, "bytes"))
            .andExpect(header().longValue(HttpHeaders.CONTENT_LENGTH, 4096L))
            .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "video/mp4"))
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "private, no-store, max-age=0"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(content().string(""))

        then(cloudExternalPlaybackTokenService).should().getFile(token = "raw-token", fileId = 12L)
        then(cloudExternalPlaybackTokenService).shouldHaveNoMoreInteractions()
    }
}
