package com.back.global.storage.health

import com.back.global.storage.adapter.CloudStorageAdapter
import com.back.global.storage.config.CloudStorageProperties
import com.back.global.storage.metrics.CloudMediaMetrics
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.boot.health.contributor.Status
import org.springframework.test.util.ReflectionTestUtils
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketResponse
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.amazon.awssdk.services.s3.model.S3Exception
import java.net.SocketTimeoutException
import java.net.UnknownHostException

@DisplayName("Storage dependency readiness")
class StorageDependencyHealthIndicatorTest {
    @Test
    fun `successful bucket probe reports ready with credential identity only`() {
        val registry = SimpleMeterRegistry()
        val indicator = indicator(registry) { HeadBucketResponse.builder().build() }

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UP)
        assertThat(health.details).containsOnlyKeys("state", "credentialVersion")
        assertThat(health.details["state"]).isEqualTo("ready")
        assertThat(health.details["credentialVersion"]).isEqualTo("7")
        assertThat(health.details.toString()).doesNotContain(TEST_SECRET)
    }

    @Test
    fun `disabled storage is ready without credential detail`() {
        val registry = SimpleMeterRegistry()
        val properties = configuredProperties().apply { enabled = false }
        val adapter = CloudStorageAdapter(properties, registry)
        val indicator = StorageDependencyHealthIndicator(adapter, registry)

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.UP)
        assertThat(health.details).containsOnlyKeys("state")
        assertThat(health.details["state"]).isEqualTo("disabled")
    }

    @Test
    fun `dependency failures use bounded safe reasons and metrics`() {
        val failures =
            listOf(
                StorageDependencyFailureReason.MISSING_BUCKET to
                    NoSuchBucketException
                        .builder()
                        .statusCode(404)
                        .message("missing")
                        .build(),
                StorageDependencyFailureReason.ACCESS_DENIED to s3Error("AccessDenied", 403),
                StorageDependencyFailureReason.INVALID_CREDENTIAL to s3Error("InvalidAccessKeyId", 403),
                StorageDependencyFailureReason.DNS to
                    SdkClientException
                        .builder()
                        .message("dns")
                        .cause(UnknownHostException("minio"))
                        .build(),
                StorageDependencyFailureReason.TIMEOUT to
                    SdkClientException
                        .builder()
                        .message("timeout")
                        .cause(SocketTimeoutException("timeout"))
                        .build(),
                StorageDependencyFailureReason.OTHER to SdkClientException.builder().message("other").build(),
            )

        failures.forEach { (expectedReason, error) ->
            val registry = SimpleMeterRegistry()
            val indicator = indicator(registry) { throw error }

            val health = indicator.health()

            assertThat(health.status).isEqualTo(Status.DOWN)
            assertThat(health.details).containsOnlyKeys("state", "reason", "credentialVersion")
            assertThat(health.details["state"]).isEqualTo("down")
            assertThat(health.details["reason"]).isEqualTo(expectedReason.wireValue)
            assertThat(health.details["credentialVersion"]).isEqualTo("7")
            assertThat(health.details.toString()).doesNotContain(TEST_SECRET)
            assertThat(
                registry
                    .get(CloudMediaMetrics.STORAGE_DEPENDENCY_FAILURES)
                    .tag("reason", expectedReason.wireValue)
                    .counter()
                    .count(),
            ).isEqualTo(1.0)
        }
    }

    @Test
    fun `invalid enabled configuration fails closed before S3 client creation`() {
        val registry = SimpleMeterRegistry()
        val properties = configuredProperties().apply { credentialVersion = "0" }
        val adapter = CloudStorageAdapter(properties, registry)
        val indicator = StorageDependencyHealthIndicator(adapter, registry)

        val health = indicator.health()

        assertThat(health.status).isEqualTo(Status.DOWN)
        assertThat(health.details).containsOnlyKeys("state", "reason")
        assertThat(health.details["reason"]).isEqualTo("invalid_configuration")
        assertThat(health.details.toString()).doesNotContain(TEST_SECRET)
    }

    private fun indicator(
        registry: SimpleMeterRegistry,
        onHeadBucket: () -> HeadBucketResponse,
    ): StorageDependencyHealthIndicator {
        val properties = configuredProperties()
        val adapter = CloudStorageAdapter(properties, registry)
        ReflectionTestUtils.setField(adapter, "s3Client", HeadBucketS3Client(onHeadBucket))
        return StorageDependencyHealthIndicator(adapter, registry)
    }

    private fun configuredProperties(): CloudStorageProperties =
        CloudStorageProperties(
            enabled = true,
            endpoint = "http://minio:9000",
            region = "us-east-1",
            bucket = "contract-bucket",
            accessKey = "contract-access",
            secretKey = TEST_SECRET,
            credentialVersion = "7",
        )

    private fun s3Error(
        code: String,
        status: Int,
    ): S3Exception =
        S3Exception
            .builder()
            .statusCode(status)
            .awsErrorDetails(AwsErrorDetails.builder().errorCode(code).build())
            .build() as S3Exception

    private class HeadBucketS3Client(
        private val onHeadBucket: () -> HeadBucketResponse,
    ) : S3Client {
        override fun headBucket(headBucketRequest: HeadBucketRequest): HeadBucketResponse = onHeadBucket()

        override fun serviceName(): String = "s3"

        override fun close() {
            // Test double has no resources.
        }
    }

    private companion object {
        const val TEST_SECRET = "contract-secret-not-for-production"
    }
}
