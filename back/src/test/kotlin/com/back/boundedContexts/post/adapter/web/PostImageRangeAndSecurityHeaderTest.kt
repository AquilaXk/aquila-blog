package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.application.port.input.ProfileImageReadUseCase
import com.back.boundedContexts.post.adapter.storage.PostImageStorageAdapter
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.application.service.PostImageReadAccessService
import com.back.global.exception.application.AppException
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.config.StoragePropertiesPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFileOwnerType
import com.back.global.storage.domain.UploadedFilePurpose
import com.back.global.storage.domain.UploadedFileStatus
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.http.AbortableInputStream
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.S3Exception
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean

@DisplayName("PostImage S3 Range·MIME 허용목록·CSP 보안 헤더 테스트")
class PostImageRangeAndSecurityHeaderTest {
    @Test
    @DisplayName("PostImageStorageAdapter는 Range 요청 시 S3 GetObjectRequest에 네이티브 range를 전달하고 totalLength를 복원한다")
    fun `adapter passes native range to S3 and handles 416`() {
        val s3Client = mock(S3Client::class.java)
        val properties =
            object : StoragePropertiesPort {
                override val enabled = true
                override val endpoint = "http://127.0.0.1:9000"
                override val region = "us-east-1"
                override val bucket = "blog-bucket"
                override val keyPrefix = "posts"
                override val pathStyleAccess = true
                override val accessKey = "test-access"
                override val secretKey = "test-secret"
                override val credentialVersion = "v1"
                override val maxFileSizeBytes = 10_485_760L
            }
        val adapter = PostImageStorageAdapter(properties)
        val clientField = PostImageStorageAdapter::class.java.getDeclaredField("s3Client").apply { isAccessible = true }
        clientField.set(adapter, s3Client)

        val responseMetadata =
            GetObjectResponse
                .builder()
                .contentType("image/png")
                .contentLength(4L)
                .contentRange("bytes 2-5/10")
                .build()
        val responseStream = ResponseInputStream(responseMetadata, AbortableInputStream.create(ByteArrayInputStream("2345".toByteArray())))
        val captor = ArgumentCaptor.forClass(GetObjectRequest::class.java)
        `when`(s3Client.getObject(captor.capture())).thenReturn(responseStream)

        val result = adapter.getPostImage("posts/2026/06/sample.png", 2L..5L)

        assertThat(captor.value.range()).isEqualTo("bytes=2-5")
        assertThat(result).isNotNull
        assertThat(result!!.isPartialContent).isTrue()
        assertThat(result.totalContentLength).isEqualTo(10L)
        assertThat(result.partialStart).isEqualTo(2L)
        assertThat(result.partialEnd).isEqualTo(5L)
        assertThat(result.inputStream.readAllBytes()).isEqualTo("2345".toByteArray())

        val rangeError =
            S3Exception
                .builder()
                .statusCode(416)
                .message("Range Not Satisfiable")
                .build()
        `when`(s3Client.getObject(any(GetObjectRequest::class.java)))
            .thenThrow(rangeError)

        val unsatisfiable = adapter.getPostImage("posts/2026/06/sample.png", 99L..120L)
        assertThat(unsatisfiable).isNotNull
        assertThat(unsatisfiable!!.rangeUnsatisfiable).isTrue()
    }

    @Test
    @DisplayName("ApiV1PostImageController는 비허용 MIME을 차단하고 안전한 이미지 응답에 nosniff와 샌드박스 CSP를 붙인다")
    fun `controller rejects non allowlisted mime and attaches nosniff and sandbox csp`() {
        val objectKey = "posts/2026/06/sample.png"
        val uploadedFile =
            UploadedFile(
                objectKey = objectKey,
                bucket = "blog-bucket",
                contentType = "image/png",
                fileSize = 10L,
                purpose = UploadedFilePurpose.POST_IMAGE,
                ownerType = UploadedFileOwnerType.POST,
                ownerId = 10L,
                status = UploadedFileStatus.ACTIVE,
            )
        val uploadedFileRepository = mock(UploadedFileRepositoryPort::class.java)
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        val postRepository = mock(PostRepositoryPort::class.java)
        `when`(postRepository.existsPublicPostReferencingImage(objectKey)).thenReturn(true)

        val closedUnsafeStream = AtomicBoolean(false)
        val storagePort =
            object : PostImageStoragePort {
                override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String = objectKey

                override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject =
                    PostImageStoragePort.StoredObject(
                        inputStream =
                            object : ByteArrayInputStream("<svg/>".toByteArray()) {
                                override fun close() {
                                    closedUnsafeStream.set(true)
                                    super.close()
                                }
                            },
                        contentType = "image/svg+xml",
                        contentLength = 6L,
                    )

                override fun getPostImage(
                    objectKey: String,
                    range: LongRange?,
                ): PostImageStoragePort.StoredObject {
                    if (range == null) return getPostImage(objectKey)
                    return PostImageStoragePort.StoredObject(
                        inputStream = ByteArrayInputStream("2345".toByteArray()),
                        contentType = "image/png",
                        contentLength = 4L,
                        totalContentLength = 10L,
                        isPartialContent = true,
                        partialStart = 2L,
                        partialEnd = 5L,
                    )
                }

                override fun deletePostImage(objectKey: String) = Unit

                override fun deletePostFile(objectKey: String) = Unit

                override fun listObjects(
                    prefix: String,
                    limit: Int,
                ): PostImageStoragePort.StoredObjectListing = PostImageStoragePort.StoredObjectListing(emptyList(), false)
            }

        val controller =
            ApiV1PostImageController(
                postImageStorageService = storagePort,
                storageProperties =
                    object : StoragePropertiesPort {
                        override val enabled = true
                        override val endpoint = "http://127.0.0.1:9000"
                        override val region = "us-east-1"
                        override val bucket = "blog-bucket"
                        override val keyPrefix = "posts"
                        override val pathStyleAccess = true
                        override val accessKey = "a"
                        override val secretKey = "s"
                        override val credentialVersion = "v1"
                        override val maxFileSizeBytes = 10_485_760L
                    },
                uploadedFileRetentionService = mock(UploadedFileRetentionService::class.java),
                postImageReadAccessUseCase =
                    PostImageReadAccessService(
                        uploadedFileRepository = uploadedFileRepository,
                        postRepository = postRepository,
                        profileImageReadUseCase = mock(ProfileImageReadUseCase::class.java),
                    ),
            )

        assertThatThrownBy {
            controller.getPostImage(MockHttpServletRequest("GET", "/post/api/v1/images/$objectKey"))
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("지원하지 않는 이미지 형식")
        assertThat(closedUnsafeStream.get()).isTrue()

        val rangeRequest =
            MockHttpServletRequest("GET", "/post/api/v1/images/$objectKey").apply {
                addHeader(HttpHeaders.RANGE, "bytes=2-5")
            }
        val partialResponse = controller.getPostImage(rangeRequest)
        assertThat(partialResponse.statusCode).isEqualTo(HttpStatus.PARTIAL_CONTENT)
        assertThat(partialResponse.headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff")
        assertThat(partialResponse.headers.getFirst("Content-Security-Policy")).isEqualTo("default-src 'none'; sandbox")
        assertThat(partialResponse.headers.getFirst(HttpHeaders.CONTENT_RANGE)).isEqualTo("bytes 2-5/10")
        assertThat(partialResponse.body!!.inputStream.readAllBytes()).isEqualTo("2345".toByteArray())
    }
}
