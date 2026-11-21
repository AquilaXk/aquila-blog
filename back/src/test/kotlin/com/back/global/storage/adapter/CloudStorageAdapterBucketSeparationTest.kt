package com.back.global.storage.adapter

import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import com.back.global.storage.health.StorageDependencyFailureReason
import com.back.global.storage.health.StorageDependencyState
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
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.amazon.awssdk.services.s3.model.S3Exception
import software.amazon.awssdk.services.s3.model.UploadPartRequest
import software.amazon.awssdk.services.s3.model.UploadPartResponse
import java.io.ByteArrayInputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@DisplayName("CloudStorageAdapter 버킷 분리 및 설정 검증 테스트")
class CloudStorageAdapterBucketSeparationTest {
    private val objectKey = "cloud/7/video/demo.mp4"

    @Test
    @DisplayName("전용 cloudBucket이 설정되면 두 버킷을 모두 프로브하고 모든 S3 요청을 cloudBucket으로 라우팅한다")
    fun dedicatedCloudBucketProbesBothBucketsAndRoutesOperationsToCloudBucket() {
        val s3Client = BucketRecordingS3Client()
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
        assertThat(s3Client.headBucketRequests.map { it.bucket() })
            .containsExactly("blog-cloud-private", "blog-images")

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

    @Test
    @DisplayName("공백이 포함된 bucket 또는 cloudBucket은 INVALID_CONFIGURATION으로 실패한다")
    fun untrimmedOrBlankBucketConfigurationFailsClosed() {
        val invalidConfigs =
            listOf(
                " blog-images " to "",
                "blog-images" to " blog-cloud-private ",
                "blog-images" to " ",
            )

        for ((bucket, cloudBucket) in invalidConfigs) {
            val s3Client = BucketRecordingS3Client()
            val adapter =
                CloudStorageAdapter(
                    CloudStorageProperties(
                        enabled = true,
                        endpoint = "http://minio:9000",
                        region = "us-east-1",
                        bucket = bucket,
                        cloudBucket = cloudBucket,
                        accessKey = "contract-access",
                        secretKey = "contract-secret-not-for-production",
                        credentialVersion = "1",
                    ),
                )
            ReflectionTestUtils.setField(adapter, "s3Client", s3Client)

            val probeResult = adapter.probeStorageDependency()

            assertThat(probeResult.state).isEqualTo(StorageDependencyState.DOWN)
            assertThat(probeResult.reason).isEqualTo(StorageDependencyFailureReason.INVALID_CONFIGURATION)
            assertThat(s3Client.headBucketRequests).isEmpty()
            assertThatThrownBy { adapter.head(objectKey) }
                .isInstanceOf(AppException::class.java)
                .hasMessageContaining("reason=invalid_configuration")
        }
    }

    @Test
    @DisplayName("분리된 버킷 구성에서 기본 post 버킷이 누락되면 프로브는 MISSING_BUCKET으로 실패한다")
    fun missingSecondaryPostBucketFailsProbeWithMissingBucket() {
        val s3Client =
            BucketRecordingS3Client { request ->
                if (request.bucket() == "blog-images") {
                    throw NoSuchBucketException
                        .builder()
                        .statusCode(404)
                        .message("post bucket missing")
                        .build()
                }
                HeadBucketResponse.builder().build()
            }
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
                ),
            )
        ReflectionTestUtils.setField(adapter, "s3Client", s3Client)

        val result = adapter.probeStorageDependency()

        assertThat(result.state).isEqualTo(StorageDependencyState.DOWN)
        assertThat(result.reason).isEqualTo(StorageDependencyFailureReason.MISSING_BUCKET)
        assertThat(s3Client.headBucketRequests.map { it.bucket() })
            .containsExactly("blog-cloud-private", "blog-images")

        val runtimeMissingBucketClient =
            BucketRecordingS3Client(
                onHeadObject = {
                    throw NoSuchBucketException
                        .builder()
                        .statusCode(404)
                        .message("cloud bucket missing")
                        .build()
                },
            )
        val runtimeAdapter =
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
        ReflectionTestUtils.setField(runtimeAdapter, "s3Client", runtimeMissingBucketClient)
        assertThatThrownBy { runtimeAdapter.head(objectKey) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("reason=missing_bucket")

        val runtimeOtherErrorClient =
            BucketRecordingS3Client(
                onHeadObject = {
                    throw S3Exception
                        .builder()
                        .statusCode(500)
                        .message("s3 internal error")
                        .build()
                },
            )
        val runtimeOtherAdapter =
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
        ReflectionTestUtils.setField(runtimeOtherAdapter, "s3Client", runtimeOtherErrorClient)
        assertThatThrownBy { runtimeOtherAdapter.head(objectKey) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("500-1")
    }

    private class BucketRecordingS3Client(
        private val onHeadObject: () -> HeadObjectResponse = {
            HeadObjectResponse
                .builder()
                .contentLength(4)
                .contentType("video/mp4")
                .eTag("\"etag-1\"")
                .build()
        },
        private val onHeadBucket: (HeadBucketRequest) -> HeadBucketResponse = {
            HeadBucketResponse.builder().build()
        },
    ) : S3Client {
        val headBucketRequests = mutableListOf<HeadBucketRequest>()
        var lastGetObjectRequest: GetObjectRequest? = null
            private set
        var lastHeadObjectRequest: HeadObjectRequest? = null
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

        override fun headBucket(headBucketRequest: HeadBucketRequest): HeadBucketResponse {
            headBucketRequests += headBucketRequest
            return onHeadBucket(headBucketRequest)
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
            val bytes = "demo".toByteArray()
            val response =
                GetObjectResponse
                    .builder()
                    .contentType("video/mp4")
                    .contentLength(bytes.size.toLong())
                    .metadata(
                        mapOf(
                            "original-filename" to
                                URLEncoder
                                    .encode("demo.mp4", StandardCharsets.UTF_8)
                                    .replace("+", "%20"),
                        ),
                    ).build()
            return ResponseInputStream(response, AbortableInputStream.create(ByteArrayInputStream(bytes)))
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
            lastListObjectsRequest = listObjectsV2Request
            return ListObjectsV2Response
                .builder()
                .contents(emptyList())
                .isTruncated(false)
                .build()
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
