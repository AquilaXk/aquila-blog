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
import java.net.URI
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
    fun `consecutive failed readiness checks reuse the bounded down result`() {
        val registry = SimpleMeterRegistry()
        val properties = configuredProperties()
        val client =
            HeadBucketS3Client {
                throw SdkClientException
                    .builder()
                    .message("timeout")
                    .cause(SocketTimeoutException("timeout"))
                    .build()
            }
        val adapter = CloudStorageAdapter(properties, registry)
        ReflectionTestUtils.setField(adapter, "s3Client", client)
        val indicator = StorageDependencyHealthIndicator(adapter, registry)

        assertThat(indicator.health().status).isEqualTo(Status.DOWN)
        assertThat(indicator.health().status).isEqualTo(Status.DOWN)
        assertThat(client.headBucketCalls).isEqualTo(1)
    }

    @Test
    fun `successful readiness checks remain live instead of reusing stale up`() {
        val registry = SimpleMeterRegistry()
        val properties = configuredProperties()
        val client = HeadBucketS3Client { HeadBucketResponse.builder().build() }
        val adapter = CloudStorageAdapter(properties, registry)
        ReflectionTestUtils.setField(adapter, "s3Client", client)
        val indicator = StorageDependencyHealthIndicator(adapter, registry)

        assertThat(indicator.health().status).isEqualTo(Status.UP)
        assertThat(indicator.health().status).isEqualTo(Status.UP)
        assertThat(client.headBucketCalls).isEqualTo(2)
    }

    @Test
    fun `down cache expires at the minimum reprobe boundary and ready clears it`() {
        var now = 100L
        val cache = StorageDependencyDownCache(minimumReprobeNanos = 5L) { now }
        val down = StorageDependencyProbeResult.down(StorageDependencyFailureReason.TIMEOUT, "7")

        cache.record(down)
        assertThat(cache.reusableDown()).isEqualTo(down)
        now = 104L
        assertThat(cache.reusableDown()).isEqualTo(down)
        now = 105L
        assertThat(cache.reusableDown()).isNull()

        cache.record(down)
        cache.record(StorageDependencyProbeResult.ready("7"))
        assertThat(cache.reusableDown()).isNull()
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
    fun `generic object or multipart 404 is not classified as a missing bucket`() {
        assertThat(StorageDependencyFailureClassifier.classify(s3Error("NoSuchUpload", 404)))
            .isEqualTo(StorageDependencyFailureReason.OTHER)
        assertThat(StorageDependencyFailureClassifier.classify(s3Error("NoSuchKey", 404)))
            .isEqualTo(StorageDependencyFailureReason.OTHER)
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

    @Test
    fun `default down result omits credential identity`() {
        val result = StorageDependencyProbeResult.down(StorageDependencyFailureReason.OTHER)

        assertThat(result.state).isEqualTo(StorageDependencyState.DOWN)
        assertThat(result.reason).isEqualTo(StorageDependencyFailureReason.OTHER)
        assertThat(result.credentialVersion).isNull()
    }

    @Test
    fun `shared prober builds the SDK client before reporting bucket failure`() {
        val outcome =
            StorageDependencyProber.probe(
                enabled = true,
                existingClient = null,
                forcePathStyle = true,
            ) {
                validatedConfiguration(endpoint = URI.create("http://127.0.0.1:1"))
            }

        try {
            assertThat(outcome.client).isNotNull()
            assertThat(outcome.result.state).isEqualTo(StorageDependencyState.DOWN)
            assertThat(outcome.result.credentialVersion).isEqualTo("7")
            assertThat(outcome.failureStage).isEqualTo(StorageDependencyProbeStage.BUCKET)
        } finally {
            outcome.client?.close()
        }
    }

    @Test
    fun `shared prober reports client construction failure without alternate client`() {
        val outcome =
            StorageDependencyProber.probe(
                enabled = true,
                existingClient = null,
                forcePathStyle = true,
            ) {
                validatedConfiguration(endpoint = URI.create("relative-endpoint"))
            }

        assertThat(outcome.client).isNull()
        assertThat(outcome.result.state).isEqualTo(StorageDependencyState.DOWN)
        assertThat(outcome.result.reason).isEqualTo(StorageDependencyFailureReason.OTHER)
        assertThat(outcome.result.credentialVersion).isEqualTo("7")
        assertThat(outcome.failureStage).isEqualTo(StorageDependencyProbeStage.CLIENT)
    }

    @Test
    fun `invalid endpoint and blank bucket fail closed with bounded reason`() {
        listOf(
            configuredProperties().apply { endpoint = "ftp://minio:9000" },
            configuredProperties().apply { bucket = " " },
        ).forEach { properties ->
            val registry = SimpleMeterRegistry()
            val health = StorageDependencyHealthIndicator(CloudStorageAdapter(properties, registry), registry).health()

            assertThat(health.status).isEqualTo(Status.DOWN)
            assertThat(health.details).containsOnlyKeys("state", "reason")
            assertThat(health.details["reason"]).isEqualTo(StorageDependencyFailureReason.INVALID_CONFIGURATION.wireValue)
        }
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

    private fun validatedConfiguration(endpoint: URI): ValidatedStorageConfiguration =
        ValidatedStorageConfiguration(
            endpoint = endpoint,
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
        var headBucketCalls: Int = 0
            private set

        override fun headBucket(headBucketRequest: HeadBucketRequest): HeadBucketResponse {
            headBucketCalls++
            return onHeadBucket()
        }

        override fun serviceName(): String = "s3"

        override fun close() {
            // Test double has no resources.
        }
    }

    private companion object {
        const val TEST_SECRET = "contract-secret-not-for-production"
    }
}
