package com.back.global.storage.adapter

import com.back.boundedContexts.post.adapter.storage.PostImageStorageAdapter
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.storage.config.CloudStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.test.util.ReflectionTestUtils
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CreateBucketRequest
import software.amazon.awssdk.services.s3.model.CreateBucketResponse
import software.amazon.awssdk.services.s3.model.HeadBucketRequest
import software.amazon.awssdk.services.s3.model.HeadBucketResponse
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import java.nio.file.Path
import kotlin.io.path.readText

@DisplayName("Storage runtime identity 계약")
class StorageRuntimeIdentityContractTest {
    @Test
    fun `application storage adapters never reference MinIO root credentials`() {
        runtimeAdapterSources().forEach { source ->
            assertThat(source)
                .doesNotContain("MINIO_ROOT_USER")
                .doesNotContain("MINIO_ROOT_PASSWORD")
        }
    }

    @Test
    fun `application storage adapters never own bucket creation`() {
        runtimeAdapterSources().forEach { source ->
            assertThat(source)
                .doesNotContain("CreateBucketRequest")
                .doesNotContain(".createBucket(")
        }
    }

    @Test
    fun `missing bucket never triggers application bucket creation`() {
        val postClient = MissingBucketS3Client()
        val postAdapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = true,
                    bucket = "contract-bucket",
                ),
            )
        ReflectionTestUtils.setField(postAdapter, "s3Client", postClient)

        val cloudClient = MissingBucketS3Client()
        val cloudAdapter =
            CloudStorageAdapter(
                CloudStorageProperties(
                    enabled = true,
                    bucket = "contract-bucket",
                ),
            )
        ReflectionTestUtils.setField(cloudAdapter, "s3Client", cloudClient)

        postAdapter.initializeBucket()
        cloudAdapter.initializeBucket()

        assertThat(postClient.createBucketCalls).isZero()
        assertThat(cloudClient.createBucketCalls).isZero()
    }

    private fun runtimeAdapterSources(): List<String> =
        listOf(
            Path.of("src/main/kotlin/com/back/boundedContexts/post/adapter/storage/PostImageStorageAdapter.kt"),
            Path.of("src/main/kotlin/com/back/global/storage/adapter/CloudStorageAdapter.kt"),
        ).map(Path::readText)

    private class MissingBucketS3Client : S3Client {
        var createBucketCalls: Int = 0
            private set

        override fun headBucket(headBucketRequest: HeadBucketRequest): HeadBucketResponse {
            throw NoSuchBucketException
                .builder()
                .message("bucket is missing")
                .statusCode(404)
                .build()
        }

        override fun createBucket(createBucketRequest: CreateBucketRequest): CreateBucketResponse {
            createBucketCalls++
            return CreateBucketResponse.builder().build()
        }

        override fun serviceName(): String = "s3"

        override fun close() {
            // Test double has no resources.
        }
    }
}
