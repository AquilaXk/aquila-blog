package com.back.boundedContexts.post.adapter.storage

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.test.util.ReflectionTestUtils
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.amazon.awssdk.services.s3.model.S3Object
import java.io.ByteArrayInputStream

@DisplayName("PostImageStorageAdapter 테스트")
class PostImageStorageAdapterTest {
    private companion object {
        const val TEST_BUCKET = "test-bucket"
    }

    @Test
    @DisplayName("post prefix 밖 object key는 storage 접근 전에 거절한다")
    fun `post object reader rejects keys outside configured post prefix before storage access`() {
        // given
        val adapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = false,
                    keyPrefix = "posts",
                ),
            )

        // when & then
        assertThatThrownBy {
            adapter.getPostImage("cloud/1/private/2026/06/leaked.png")
        }.hasMessageContaining("400-1")
            .hasMessageContaining("유효하지 않은 이미지 경로입니다.")
    }

    @Test
    @DisplayName("post prefix 내부 object key는 정상 storage 경로로 진행한다")
    fun `post object reader keeps configured post prefix keys on the normal storage path`() {
        // given
        val adapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = false,
                    keyPrefix = "posts",
                ),
            )

        // when & then
        assertThatThrownBy {
            adapter.getPostImage("posts/2026/06/image.png")
        }.hasMessageContaining("503-1")
            .hasMessageContaining("이미지 스토리지가 비활성화되어 있습니다.")
    }

    @Test
    @DisplayName("listObjects는 post prefix와 limit으로 S3 inventory를 조회한다")
    fun listObjectsUsesConfiguredPostPrefixAndLimit() {
        // given
        val s3Client =
            RecordingS3Client(
                ListObjectsV2Response
                    .builder()
                    .contents(
                        S3Object
                            .builder()
                            .key("posts/2026/06/a.png")
                            .size(10L)
                            .build(),
                        S3Object
                            .builder()
                            .key("posts/2026/06/b.png")
                            .size(20L)
                            .build(),
                    ).isTruncated(false)
                    .build(),
            )
        val adapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = true,
                    bucket = TEST_BUCKET,
                    keyPrefix = "posts",
                ),
            )
        ReflectionTestUtils.setField(adapter, "s3Client", s3Client)

        // when
        val listing = adapter.listObjects("posts/2026/06", limit = 25)

        // then
        assertThat(s3Client.lastListObjectsRequest!!.bucket()).isEqualTo(TEST_BUCKET)
        assertThat(s3Client.lastListObjectsRequest!!.prefix()).isEqualTo("posts/2026/06/")
        assertThat(s3Client.lastListObjectsRequest!!.maxKeys()).isEqualTo(25)
        assertThat(listing.isTruncated).isFalse()
        assertThat(listing.objects).containsExactly(
            PostImageStoragePort.StoredObjectSummary("posts/2026/06/a.png", 10),
            PostImageStoragePort.StoredObjectSummary("posts/2026/06/b.png", 20),
        )
    }

    @Test
    @DisplayName("listObjects는 post prefix 밖 inventory 요청을 거절한다")
    fun listObjectsRejectsPrefixOutsideConfiguredPostPrefix() {
        // given
        val adapter = disabledAdapter()

        // when & then
        assertThatThrownBy {
            adapter.listObjects("cloud/2026/06", limit = 25)
        }.hasMessageContaining("400-1")
            .hasMessageContaining("유효하지 않은 이미지 경로입니다.")
    }

    @Test
    @DisplayName("listObjects는 빈 keyPrefix에서 bucket root inventory를 조회한다")
    fun listObjectsAllowsRootPrefixWhenConfiguredPrefixIsBlank() {
        // given
        val s3Client =
            RecordingS3Client(
                ListObjectsV2Response
                    .builder()
                    .contents(
                        S3Object
                            .builder()
                            .key("2026/06/root.png")
                            .size(10L)
                            .build(),
                    ).isTruncated(false)
                    .build(),
            )
        val adapter =
            PostImageStorageAdapter(
                PostImageStorageProperties(
                    enabled = true,
                    bucket = TEST_BUCKET,
                    keyPrefix = "",
                ),
            )
        ReflectionTestUtils.setField(adapter, "s3Client", s3Client)

        // when
        val listing = adapter.listObjects("", limit = 25)

        // then
        assertThat(s3Client.lastListObjectsRequest!!.prefix()).isEqualTo("")
        assertThat(listing.objects).containsExactly(
            PostImageStoragePort.StoredObjectSummary("2026/06/root.png", 10),
        )
    }

    @Test
    @DisplayName("stream 이미지 업로드는 빈 contentLength를 storage 접근 전에 거절한다")
    fun rejectEmptyImageUploadBeforeStorageAccess() {
        // given
        val adapter = disabledAdapter()

        // when & then
        assertThatThrownBy {
            adapter.uploadPostImage(
                PostImageStoragePort.UploadImageRequest(
                    inputStream = ByteArrayInputStream(ByteArray(0)),
                    contentLength = 0,
                    contentType = "image/png",
                    originalFilename = "empty.png",
                ),
            )
        }.hasMessageContaining("400-1")
            .hasMessageContaining("이미지 파일이 비어 있습니다.")
    }

    @Test
    @DisplayName("stream 이미지 업로드는 크기 초과를 storage 접근 전에 거절한다")
    fun rejectOversizedImageUploadBeforeStorageAccess() {
        // given
        val adapter = disabledAdapter(maxFileSizeBytes = 8)

        // when & then
        assertThatThrownBy {
            adapter.uploadPostImage(
                PostImageStoragePort.UploadImageRequest(
                    inputStream = ByteArrayInputStream(pngBytes()),
                    contentLength = 9,
                    contentType = "image/png",
                    originalFilename = "large.png",
                ),
            )
        }.hasMessageContaining("400-1")
            .hasMessageContaining("이미지 파일은 0MB 이하여야 합니다.")
    }

    @Test
    @DisplayName("stream 이미지 업로드는 signature 기반 형식 검증을 유지한다")
    fun rejectUnsupportedImageSignatureBeforeStorageAccess() {
        // given
        val adapter = disabledAdapter()

        // when & then
        assertThatThrownBy {
            adapter.uploadPostImage(
                PostImageStoragePort.UploadImageRequest(
                    inputStream = ByteArrayInputStream("not-image".toByteArray()),
                    contentLength = "not-image".length.toLong(),
                    contentType = "image/png",
                    originalFilename = "spoof.png",
                ),
            )
        }.hasMessageContaining("400-1")
            .hasMessageContaining("지원하지 않는 이미지 형식입니다.")
    }

    @Test
    @DisplayName("stream 이미지 업로드는 실제 stream 길이와 contentLength 불일치를 거절한다")
    fun rejectImageUploadWhenStreamLengthDiffersFromContentLength() {
        // given
        val adapter = disabledAdapter()

        // when & then
        assertThatThrownBy {
            adapter.uploadPostImage(
                PostImageStoragePort.UploadImageRequest(
                    inputStream = ByteArrayInputStream(pngBytes()),
                    contentLength = pngBytes().size + 1L,
                    contentType = "image/png",
                    originalFilename = "truncated.png",
                ),
            )
        }.hasMessageContaining("400-1")
            .hasMessageContaining("업로드 파일 크기 정보가 올바르지 않습니다.")
    }

    @Test
    @DisplayName("stream 첨부파일 업로드는 크기 초과를 storage 접근 전에 거절한다")
    fun rejectOversizedFileUploadBeforeStorageAccess() {
        // given
        val adapter = disabledAdapter(maxFileSizeBytes = 2)

        // when & then
        assertThatThrownBy {
            adapter.uploadPostFile(
                PostImageStoragePort.UploadFileRequest(
                    inputStream = ByteArrayInputStream("pdf".toByteArray()),
                    contentLength = 3,
                    contentType = "application/pdf",
                    originalFilename = "large.pdf",
                ),
            )
        }.hasMessageContaining("400-1")
            .hasMessageContaining("첨부 파일은 0MB 이하여야 합니다.")
    }

    private fun disabledAdapter(maxFileSizeBytes: Long = 10 * 1024 * 1024): PostImageStorageAdapter =
        PostImageStorageAdapter(
            PostImageStorageProperties(
                enabled = false,
                keyPrefix = "posts",
                maxFileSizeBytes = maxFileSizeBytes,
            ),
        )

    private fun pngBytes(): ByteArray =
        byteArrayOf(
            0x89.toByte(),
            0x50,
            0x4E,
            0x47,
            0x0D,
            0x0A,
            0x1A,
            0x0A,
            0x00,
        )

    private class RecordingS3Client(
        private val response: ListObjectsV2Response,
    ) : S3Client {
        var lastListObjectsRequest: ListObjectsV2Request? = null
            private set

        override fun listObjectsV2(listObjectsV2Request: ListObjectsV2Request): ListObjectsV2Response {
            lastListObjectsRequest = listObjectsV2Request
            return response
        }

        override fun serviceName(): String = "s3"

        override fun close() {
            // S3Client test double has no resources to close.
        }
    }
}
