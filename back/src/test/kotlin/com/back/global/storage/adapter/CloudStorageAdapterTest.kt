package com.back.global.storage.adapter

import com.back.global.exception.application.AppException
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.test.util.ReflectionTestUtils
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.S3Exception
import java.io.ByteArrayInputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@DisplayName("CloudStorageAdapter 테스트")
class CloudStorageAdapterTest {
    private val objectKey = "cloud/7/video/demo.mp4"

    @Test
    @DisplayName("openRange는 S3 Range GET 요청으로 지정 구간만 연다")
    fun openRangeUsesS3RangeRequest() {
        // given
        val s3Client = RecordingS3Client { storedResponse("demo-range".toByteArray()) }
        val adapter = adapterWithClient(s3Client)

        // when
        val storedObject = adapter.openRange(objectKey, 2L..11L)

        // then
        assertThat(s3Client.lastGetObjectRequest!!.bucket()).isEqualTo("test-bucket")
        assertThat(s3Client.lastGetObjectRequest!!.key()).isEqualTo(objectKey)
        assertThat(s3Client.lastGetObjectRequest!!.range()).isEqualTo("bytes=2-11")
        assertThat(storedObject).isNotNull
        assertThat(storedObject!!.contentType).isEqualTo("video/mp4")
        assertThat(storedObject.contentLength).isEqualTo(10)
        assertThat(storedObject.originalFilename).isEqualTo("demo video.mp4")
        assertThat(storedObject.inputStream.readBytes()).isEqualTo("demo-range".toByteArray())
    }

    @Test
    @DisplayName("openRange는 S3 NoSuchKey를 null로 변환한다")
    fun openRangeReturnsNullForNoSuchKey() {
        // given
        val s3Client =
            RecordingS3Client {
                throw NoSuchKeyException.builder().message("missing").build()
            }
        val adapter = adapterWithClient(s3Client)

        // when
        val storedObject = adapter.openRange(objectKey, 0L..9L)

        // then
        assertThat(storedObject).isNull()
    }

    @Test
    @DisplayName("openRange는 S3 404를 null로 변환한다")
    fun openRangeReturnsNullForS3NotFound() {
        // given
        val s3Client =
            RecordingS3Client {
                throw S3Exception
                    .builder()
                    .statusCode(404)
                    .message("missing")
                    .build()
            }
        val adapter = adapterWithClient(s3Client)

        // when
        val storedObject = adapter.openRange(objectKey, 0L..9L)

        // then
        assertThat(storedObject).isNull()
    }

    @Test
    @DisplayName("openRange는 S3 500을 AppException으로 변환한다")
    fun openRangeThrowsAppExceptionForS3Failure() {
        // given
        val s3Client =
            RecordingS3Client {
                throw S3Exception
                    .builder()
                    .statusCode(500)
                    .message("storage error")
                    .build()
            }
        val adapter = adapterWithClient(s3Client)

        // when & then
        assertThatThrownBy { adapter.openRange(objectKey, 0L..9L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("500-1")
            .hasMessageContaining("클라우드 파일을 불러오지 못했습니다.")
    }

    private fun adapterWithClient(s3Client: S3Client): CloudStorageAdapter {
        val adapter =
            CloudStorageAdapter(
                CloudStorageProperties(
                    enabled = true,
                    bucket = "test-bucket",
                    cloudKeyPrefix = "cloud",
                ),
            )
        ReflectionTestUtils.setField(adapter, "s3Client", s3Client)
        return adapter
    }

    private fun storedResponse(bytes: ByteArray): ResponseInputStream<GetObjectResponse> {
        val response =
            GetObjectResponse
                .builder()
                .contentType("video/mp4")
                .contentLength(bytes.size.toLong())
                .metadata(
                    mapOf(
                        "original-filename" to
                            URLEncoder
                                .encode("demo video.mp4", StandardCharsets.UTF_8)
                                .replace("+", "%20"),
                    ),
                ).build()
        return ResponseInputStream(response, AbortableInputStream.create(ByteArrayInputStream(bytes)))
    }

    private class RecordingS3Client(
        private val onGetObject: () -> ResponseInputStream<GetObjectResponse>,
    ) : S3Client {
        var lastGetObjectRequest: GetObjectRequest? = null
            private set

        override fun getObject(getObjectRequest: GetObjectRequest): ResponseInputStream<GetObjectResponse> {
            lastGetObjectRequest = getObjectRequest
            return onGetObject()
        }

        override fun serviceName(): String = "s3"

        override fun close() {
        }
    }
}
