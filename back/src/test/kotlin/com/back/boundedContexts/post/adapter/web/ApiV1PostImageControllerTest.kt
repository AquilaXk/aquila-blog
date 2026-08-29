package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.application.port.output.PostRepositoryPort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.boundedContexts.post.domain.Post
import com.back.global.app.AppConfig
import com.back.global.exception.application.AppException
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.application.port.output.UploadedFileRepositoryPort
import com.back.global.storage.domain.UploadedFile
import com.back.global.storage.domain.UploadedFilePurpose
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.web.multipart.MultipartFile
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.lang.reflect.Field

@DisplayName("ApiV1PostImageController 업로드 테스트")
class ApiV1PostImageControllerTest {
    private val postImageStorageService = FakePostImageStoragePort()
    private val uploadedFileRetentionService = mock(UploadedFileRetentionService::class.java)
    private val uploadedFileRepository = mock(UploadedFileRepositoryPort::class.java)
    private val postRepository = mock(PostRepositoryPort::class.java)
    private val controller =
        ApiV1PostImageController(
            postImageStorageService = postImageStorageService,
            postImageStorageProperties = PostImageStorageProperties(maxFileSizeBytes = 10 * 1024 * 1024),
            uploadedFileRetentionService = uploadedFileRetentionService,
            uploadedFileRepository = uploadedFileRepository,
            postRepository = postRepository,
        )

    @Test
    @DisplayName("게시글 이미지는 MultipartFile.bytes 복사 없이 stream으로 업로드한다")
    fun `posts images 업로드는 uploaded_file purpose를 POST_IMAGE로 저장한다`() {
        // given
        val file = ByteAccessFailingMultipartFile("file", "sample.png", "image/png", pngBytes())
        postImageStorageService.nextImageKey = "posts/2026/03/sample.png"

        // when
        val response = withIsolatedAppConfig { controller.uploadPostImage(file) }

        // then
        assertThat(response.resultCode).isEqualTo("201-1")
        assertThat(postImageStorageService.lastImageContentLength).isEqualTo(file.size)
        assertThat(postImageStorageService.lastImageBytes).containsExactly(*pngBytes())
        verify(uploadedFileRetentionService).registerTempUploadWithCompensation(
            "posts/2026/03/sample.png",
            "image/png",
            file.size,
            UploadedFilePurpose.POST_IMAGE,
        )
    }

    @Test
    @DisplayName("AppConfig URL 설정은 테스트 밖으로 누출되지 않는다")
    fun `AppConfig URL 설정 뒤 raw companion 상태를 복원한다`() {
        val snapshot = appConfigUrlSnapshot()

        withIsolatedAppConfig {
            assertThat(appConfigUrlSnapshot()).containsExactly(
                "https://api.aquilaxk.test",
                "https://www.aquilaxk.test",
            )
        }

        assertThat(appConfigUrlSnapshot()).isEqualTo(snapshot)
    }

    @Test
    @DisplayName("게시글 이미지는 공개 ACTIVE POST_IMAGE만 재검증 가능한 캐시 정책으로 반환한다")
    fun `images 조회는 공개 ACTIVE POST_IMAGE를 재검증 가능한 캐시 정책으로 반환한다`() {
        val objectKey = "posts/2026/03/public.png"
        val storedBytes = pngBytes()
        val uploadedFile = postImage(objectKey).apply { attachToPost(30L, UploadedFilePurpose.POST_IMAGE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(30L)).thenReturn(publicPost(30L))
        postImageStorageService.images[objectKey] =
            PostImageStoragePort.StoredObject(
                inputStream = ByteArrayInputStream(storedBytes),
                contentType = "image/png",
                contentLength = storedBytes.size.toLong(),
                originalFilename = "public.png",
            )

        val response = controller.getPostImage(imageRequest(objectKey))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.headers.contentType.toString()).isEqualTo("image/png")
        assertThat(response.headers.eTag).isNotBlank()
        assertThat(response.headers.cacheControl).contains("no-cache").contains("public").doesNotContain("immutable")
        assertThat(postImageStorageService.imageDownloads).containsExactly(objectKey)

        `when`(postRepository.findPublicDetailById(30L)).thenReturn(null)

        assertThatThrownBy {
            controller.getPostImage(
                imageRequest(objectKey).apply { addHeader(HttpHeaders.IF_NONE_MATCH, requireNotNull(response.headers.eTag)) },
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")

        assertThat(postImageStorageService.imageDownloads).containsExactly(objectKey)
    }

    @Test
    @DisplayName("TEMP 이미지는 조건부 요청에서도 storage 접근 없이 숨긴다")
    fun `images 조건부 조회는 TEMP 이미지를 storage 접근 없이 숨긴다`() {
        val objectKey = "posts/2026/03/temp.png"
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(postImage(objectKey))

        assertThatThrownBy {
            controller.getPostImage(
                imageRequest(objectKey).apply { addHeader(HttpHeaders.IF_NONE_MATCH, "*") },
            )
        }.isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")

        assertThat(postImageStorageService.imageDownloads).isEmpty()
        verifyNoInteractions(postRepository)
    }

    @Test
    @DisplayName("비공개 게시글 이미지는 storage 접근 없이 숨긴다")
    fun `images 조회는 비공개 게시글 연결 이미지를 storage 접근 없이 숨긴다`() {
        val objectKey = "posts/2026/03/private.png"
        val uploadedFile = postImage(objectKey).apply { attachToPost(40L, UploadedFilePurpose.POST_IMAGE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(40L)).thenReturn(null)

        assertThatThrownBy { controller.getPostImage(imageRequest(objectKey)) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("이미지를 찾을 수 없습니다.")

        assertThat(postImageStorageService.imageDownloads).isEmpty()
    }

    private fun <T> withIsolatedAppConfig(block: () -> T): T {
        val snapshot = appConfigUrlSnapshot()
        AppConfig(
            siteBackUrl = "https://api.aquilaxk.test",
            siteFrontUrl = "https://www.aquilaxk.test",
        )

        return try {
            block()
        } finally {
            appConfigUrlFields.zip(snapshot).forEach { (field, value) -> field.set(null, value) }
        }
    }

    private fun appConfigUrlSnapshot(): List<Any?> = appConfigUrlFields.map { field -> field.get(null) }

    private val appConfigUrlFields: List<Field> by lazy {
        listOf("siteBackUrl", "siteFrontUrl").map { name ->
            AppConfig::class.java.getDeclaredField(name).apply { isAccessible = true }
        }
    }

    private fun imageRequest(objectKey: String): MockHttpServletRequest = MockHttpServletRequest("GET", "/post/api/v1/images/$objectKey")

    private fun postImage(objectKey: String): UploadedFile =
        UploadedFile(
            objectKey = objectKey,
            bucket = "blog-images",
            contentType = "image/png",
            fileSize = pngBytes().size.toLong(),
            purpose = UploadedFilePurpose.POST_IMAGE,
        )

    private fun publicPost(id: Long): Post =
        Post(
            id = id,
            author = Member(1L, "admin", null, "관리자"),
            title = "공개 글",
            content = "본문",
            published = true,
            listed = true,
        )

    private class FakePostImageStoragePort : PostImageStoragePort {
        var nextImageKey: String = "posts/placeholder/image.png"
        var lastImageContentLength: Long? = null
        var lastImageBytes: ByteArray = ByteArray(0)
        val images = mutableMapOf<String, PostImageStoragePort.StoredObject>()
        val imageDownloads = mutableListOf<String>()

        override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String {
            lastImageContentLength = request.contentLength
            lastImageBytes = request.inputStream.use(InputStream::readBytes)
            return nextImageKey
        }

        override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject? {
            imageDownloads += objectKey
            return images[objectKey]
        }

        override fun deletePostImage(objectKey: String) {}

        override fun deletePostFile(objectKey: String) {}

        override fun listObjects(
            prefix: String,
            limit: Int,
        ): PostImageStoragePort.StoredObjectListing = PostImageStoragePort.StoredObjectListing(emptyList(), isTruncated = false)
    }

    private class ByteAccessFailingMultipartFile(
        private val name: String,
        private val originalFilename: String,
        private val contentType: String,
        private val content: ByteArray,
    ) : MultipartFile {
        override fun getName(): String = name

        override fun getOriginalFilename(): String = originalFilename

        override fun getContentType(): String = contentType

        override fun isEmpty(): Boolean = content.isEmpty()

        override fun getSize(): Long = content.size.toLong()

        override fun getBytes(): ByteArray =
            throw AssertionError("controller must pass upload content as stream without reading MultipartFile.bytes")

        override fun getInputStream(): InputStream = ByteArrayInputStream(content)

        override fun transferTo(dest: java.io.File) = dest.writeBytes(content)
    }

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
}
