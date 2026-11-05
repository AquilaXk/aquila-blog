package com.back.global.storage.adapter

import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.test.util.ReflectionTestUtils
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadResponse
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadResponse
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadResponse
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectResponse
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketResponse
import software.amazon.awssdk.services.s3.model.HeadObjectRequest
import software.amazon.awssdk.services.s3.model.HeadObjectResponse
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.S3Object
import software.amazon.awssdk.services.s3.model.UploadPartRequest
import software.amazon.awssdk.services.s3.model.UploadPartResponse
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
    @DisplayName("listObjects는 limit 미만이어도 S3 truncated를 유지한다")
    fun listObjectsKeepsTruncatedWhenBelowLimitButS3HasMore() {
        val lastModified = Instant.parse("2026-06-17T00:00:00Z")
        val s3Client =
            RecordingS3Client(
                onListObjects = {
                    ListObjectsV2Response
                        .builder()
                        .contents(
                            S3Object
                                .builder()
                                .key("cloud/7/only.mp4")
                                .size(10)
                                .lastModified(lastModified)
                                .build(),
                        ).isTruncated(true)
                        .build()
                },
            ) { error("getObject should not be called") }
        val adapter = adapterWithClient(s3Client)

        val listing = adapter.listObjects("cloud/", 10)

        assertThat(listing.objects).hasSize(1)
        assertThat(listing.isTruncated).isTrue()
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
    @DisplayName("openRange는 missing bucket을 object 404 성공으로 변환하지 않는다")
    fun openRangeFailsClosedForNoSuchBucket() {
        val s3Client =
            RecordingS3Client {
                throw NoSuchBucketException
                    .builder()
                    .statusCode(404)
                    .message("bucket missing")
                    .build()
            }
        val adapter = adapterWithClient(s3Client)

        assertThatThrownBy { adapter.openRange(objectKey, 0L..9L) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("503-1")
            .hasMessageContaining("reason=missing_bucket")
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

    @Test
    @DisplayName("전용 cloudBucket이 설정되면 모든 S3 요청과 헬스 프로브가 cloudBucket으로 전달된다")
    fun dedicatedCloudBucketRoutesAllOperationsToCloudBucket() {
        val s3Client =
            RecordingS3Client(
                onHeadObject = {
                    HeadObjectResponse
                        .builder()
                        .contentLength(4)
                        .contentType("video/mp4")
                        .eTag("\"etag-1\"")
                        .build()
                },
                onListObjects = {
                    ListObjectsV2Response
                        .builder()
                        .contents(emptyList())
                        .isTruncated(false)
                        .build()
                },
            ) { storedResponse("demo".toByteArray()) }

        val adapter =
            CloudStorageAdapter(
                CloudStorageProperties(
                    enabled = true,
                    endpoint = "http://minio:9000",
                    region = "us-east-1",
                    bucket = "blog-images",
                    cloudBucket = "blog-cloud-private",
                    accessKey = "contract-access",
                    secretKey = "contract-secret-not-for-production",
                    credentialVersion = "1",
                    cloudKeyPrefix = "cloud",
                ),
            )
        ReflectionTestUtils.setField(adapter, "s3Client", s3Client)

        adapter.initializeDependency()
        assertThat(s3Client.lastHeadBucketRequest!!.bucket()).isEqualTo("blog-images")

        adapter.upload(
            CloudStoragePort.UploadRequest(
                objectKey = objectKey,
                originalFilename = "demo.mp4",
                contentType = "video/mp4",
                contentLength = 4,
                inputStream = ByteArrayInputStream("demo".toByteArray()),
            ),
        )
        assertThat(s3Client.lastPutObjectRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.open(objectKey)
        assertThat(s3Client.lastGetObjectRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.openRange(objectKey, 0L..3L)
        assertThat(s3Client.lastGetObjectRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.initiateMultipartUpload(
            CloudStoragePort.MultipartUploadInitRequest(
                objectKey = objectKey,
                originalFilename = "demo.mp4",
                contentType = "video/mp4",
            ),
        )
        assertThat(s3Client.lastCreateMultipartRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.uploadMultipartPart(
            CloudStoragePort.MultipartUploadPartRequest(
                objectKey = objectKey,
                uploadId = "upload-1",
                partNumber = 1,
                contentLength = 4,
                inputStream = ByteArrayInputStream("demo".toByteArray()),
            ),
        )
        assertThat(s3Client.lastUploadPartRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.completeMultipartUpload(
            CloudStoragePort.MultipartUploadCompleteRequest(
                objectKey = objectKey,
                uploadId = "upload-1",
                parts = listOf(CloudStoragePort.CompletedMultipartUploadPart(partNumber = 1, eTag = "\"etag-1\"")),
            ),
        )
        assertThat(s3Client.lastCompleteMultipartRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.abortMultipartUpload(
            CloudStoragePort.MultipartUploadAbortRequest(
                objectKey = objectKey,
                uploadId = "upload-1",
            ),
        )
        assertThat(s3Client.lastAbortMultipartRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.head(objectKey)
        assertThat(s3Client.lastHeadObjectRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.listObjects("cloud/", 10)
        assertThat(s3Client.lastListObjectsRequest!!.bucket()).isEqualTo("blog-cloud-private")

        adapter.delete(objectKey)
        assertThat(s3Client.lastDeleteObjectRequest!!.bucket()).isEqualTo("blog-cloud-private")
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
        var lastHeadBucketRequest: HeadBucketRequest? = null
            private set
        var lastPutObjectRequest: PutObjectRequest? = null
            private set
        var lastCreateMultipartRequest: CreateMultipartUploadRequest? = null
            private set
        var lastUploadPartRequest: UploadPartRequest? = null
            private set
        var lastCompleteMultipartRequest: CompleteMultipartUploadRequest? = null
            private set
        var lastAbortMultipartRequest: AbortMultipartUploadRequest? = null
            private set
        var lastListObjectsRequest: ListObjectsV2Request? = null
            private set
        var lastDeleteObjectRequest: DeleteObjectRequest? = null
            private set
        var listObjectsRequestCount: Int = 0
            private set

        override fun headBucket(headBucketRequest: HeadBucketRequest): HeadBucketResponse {
            lastHeadBucketRequest = headBucketRequest
            return HeadBucketResponse.builder().build()
        }

        override fun putObject(
            putObjectRequest: PutObjectRequest,
            requestBody: RequestBody,
        ): PutObjectResponse {
            lastPutObjectRequest = putObjectRequest
            requestBody.contentStreamProvider().newStream().readBytes()
            return PutObjectResponse.builder().build()
        }

        override fun getObject(getObjectRequest: GetObjectRequest): ResponseInputStream<GetObjectResponse> {
            lastGetObjectRequest = getObjectRequest
            return onGetObject()
        }

        override fun createMultipartUpload(createMultipartUploadRequest: CreateMultipartUploadRequest): CreateMultipartUploadResponse {
            lastCreateMultipartRequest = createMultipartUploadRequest
            return CreateMultipartUploadResponse.builder().uploadId("upload-1").build()
        }

        override fun uploadPart(
            uploadPartRequest: UploadPartRequest,
            requestBody: RequestBody,
        ): UploadPartResponse {
            lastUploadPartRequest = uploadPartRequest
            requestBody.contentStreamProvider().newStream().readBytes()
            return UploadPartResponse.builder().eTag("\"etag-1\"").build()
        }

        override fun completeMultipartUpload(
            completeMultipartUploadRequest: CompleteMultipartUploadRequest,
        ): CompleteMultipartUploadResponse {
            lastCompleteMultipartRequest = completeMultipartUploadRequest
            return CompleteMultipartUploadResponse.builder().build()
        }

        override fun abortMultipartUpload(abortMultipartUploadRequest: AbortMultipartUploadRequest): AbortMultipartUploadResponse {
            lastAbortMultipartRequest = abortMultipartUploadRequest
            return AbortMultipartUploadResponse.builder().build()
        }

        override fun headObject(headObjectRequest: HeadObjectRequest): HeadObjectResponse {
            lastHeadObjectRequest = headObjectRequest
            return onHeadObject()
        }

        override fun listObjectsV2(listObjectsV2Request: ListObjectsV2Request): ListObjectsV2Response {
            listObjectsRequestCount++
            lastListObjectsRequest = listObjectsV2Request
            return onListObjects(listObjectsV2Request)
        }

        override fun deleteObject(deleteObjectRequest: DeleteObjectRequest): DeleteObjectResponse {
            lastDeleteObjectRequest = deleteObjectRequest
            return DeleteObjectResponse.builder().build()
        }

        override fun serviceName(): String = "s3"

        override fun close() {
        }
    }
}
