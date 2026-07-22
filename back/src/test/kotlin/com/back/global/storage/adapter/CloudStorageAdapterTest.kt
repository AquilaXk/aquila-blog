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
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectResponse
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.S3Object
import java.io.ByteArrayInputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant

@DisplayName("CloudStorageAdapter 테스트")
class CloudStorageAdapterTest {
    private val objectKey = "cloud/7/video/demo.mp4"

    @Test
    @DisplayName("head는 S3 HeadObject 메타데이터를 반환한다")
    fun headReturnsObjectMetadata() {
        val s3Client =
            RecordingS3Client(
                onHeadObject = {
                    HeadObjectResponse
                        .builder()
                        .contentLength(2048)
                        .contentType("video/mp4")
                        .eTag("\"etag-1\"")
                        .build()
                },
            ) { error("getObject should not be called") }
        val adapter = adapterWithClient(s3Client)

        val head = adapter.head(objectKey)

        assertThat(s3Client.lastHeadObjectRequest!!.bucket()).isEqualTo("test-bucket")
        assertThat(s3Client.lastHeadObjectRequest!!.key()).isEqualTo(objectKey)
        assertThat(head).isNotNull
        assertThat(head!!.objectKey).isEqualTo(objectKey)
        assertThat(head.contentLength).isEqualTo(2048)
        assertThat(head.contentType).isEqualTo("video/mp4")
        assertThat(head.eTag).isEqualTo("\"etag-1\"")
    }

    @Test
    @DisplayName("head는 S3 NoSuchKey를 null로 변환한다")
    fun headReturnsNullForNoSuchKey() {
        val s3Client =
            RecordingS3Client(
                onHeadObject = { throw NoSuchKeyException.builder().message("missing").build() },
            ) { error("getObject should not be called") }
        val adapter = adapterWithClient(s3Client)

        assertThat(adapter.head(objectKey)).isNull()
    }

    @Test
    @DisplayName("listObjects는 ListObjectsV2 페이지네이션으로 prefix 객체를 수집한다")
    fun listObjectsPaginatesPrefixObjects() {
        val page1Key = "cloud/7/a.mp4"
        val page2Key = "cloud/7/b.mp4"
        val lastModified = Instant.parse("2026-06-17T00:00:00Z")
        val s3Client =
            RecordingS3Client(
                onListObjects = { request ->
                    if (request.continuationToken() == null) {
                        ListObjectsV2Response
                            .builder()
                            .contents(
                                S3Object
                                    .builder()
                                    .key(page1Key)
                                    .size(10)
                                    .lastModified(lastModified)
                                    .build(),
                            ).isTruncated(true)
                            .nextContinuationToken("token-2")
                            .build()
                    } else {
                        ListObjectsV2Response
                            .builder()
                            .contents(
                                S3Object
                                    .builder()
                                    .key(page2Key)
                                    .size(20)
                                    .lastModified(lastModified)
                                    .build(),
                            ).isTruncated(false)
                            .build()
                    }
                },
            ) { error("getObject should not be called") }
        val adapter = adapterWithClient(s3Client)

        val listing = adapter.listObjects("cloud/", 10)

        assertThat(s3Client.listObjectsRequestCount).isEqualTo(2)
        assertThat(listing.isTruncated).isFalse()
        assertThat(listing.objects).hasSize(2)
        assertThat(listing.objects.map { it.objectKey }).containsExactly(page1Key, page2Key)
        assertThat(listing.objects.map { it.size }).containsExactly(10L, 20L)
        assertThat(listing.objects.map { it.lastModified }).containsOnly(lastModified)
    }

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
        private val onHeadObject: () -> HeadObjectResponse = {
            error("headObject should not be called")
        },
        private val onListObjects: (ListObjectsV2Request) -> ListObjectsV2Response = {
            error("listObjectsV2 should not be called")
        },
        private val onGetObject: () -> ResponseInputStream<GetObjectResponse>,
    ) : S3Client {
        var lastGetObjectRequest: GetObjectRequest? = null
            private set
        var lastHeadObjectRequest: HeadObjectRequest? = null
            private set
        var listObjectsRequestCount: Int = 0
            private set

        override fun getObject(getObjectRequest: GetObjectRequest): ResponseInputStream<GetObjectResponse> {
            lastGetObjectRequest = getObjectRequest
            return onGetObject()
        }

        override fun headObject(headObjectRequest: HeadObjectRequest): HeadObjectResponse {
            lastHeadObjectRequest = headObjectRequest
            return onHeadObject()
        }

        override fun listObjectsV2(listObjectsV2Request: ListObjectsV2Request): ListObjectsV2Response {
            listObjectsRequestCount++
            return onListObjects(listObjectsV2Request)
        }

        override fun serviceName(): String = "s3"

        override fun close() {
        }
    }
}
