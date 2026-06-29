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
import com.back.global.storage.domain.UploadedFileStatus
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.BeforeAll
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

@DisplayName("ApiV1PostImageController 업로드 테스트")
class ApiV1PostImageControllerTest {
    companion object {
        @JvmStatic
        @BeforeAll
        fun initAppConfig() {
            AppConfig(
                siteBackUrl = "https://api.aquilaxk.test",
                siteFrontUrl = "https://www.aquilaxk.test",
            )
        }
    }

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
        val response = controller.uploadPostImage(file)

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
    @DisplayName("게시글 첨부파일은 MultipartFile.bytes 복사 없이 stream으로 업로드한다")
    fun `posts files 업로드는 uploaded_file purpose를 POST_FILE로 저장한다`() {
        // given
        val file = ByteAccessFailingMultipartFile("file", "manual.pdf", "application/pdf", "pdf".toByteArray())
        postImageStorageService.nextFileKey = "posts/2026/03/manual.pdf"

        // when
        val response = controller.uploadPostFile(file)

        // then
        assertThat(response.resultCode).isEqualTo("201-2")
        assertThat(postImageStorageService.lastFileContentLength).isEqualTo(file.size)
        assertThat(postImageStorageService.lastFileBytes).containsExactly(*"pdf".toByteArray())
        verify(uploadedFileRetentionService).registerTempUploadWithCompensation(
            "posts/2026/03/manual.pdf",
            "application/pdf",
            file.size,
            UploadedFilePurpose.POST_FILE,
        )
    }

    @Test
    @DisplayName("게시글 첨부파일 다운로드는 공개 ACTIVE POST_FILE만 반환한다")
    fun `files 다운로드는 공개 ACTIVE POST_FILE만 반환한다`() {
        val objectKey = "posts/2026/03/manual.pdf"
        val storedBytes = "pdf".toByteArray()
        val uploadedFile = postFile(objectKey).apply { attachToPost(10L, UploadedFilePurpose.POST_FILE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(10L)).thenReturn(publicPost(10L))
        postImageStorageService.files[objectKey] =
            PostImageStoragePort.StoredObject(
                inputStream = ByteArrayInputStream(storedBytes),
                contentType = "application/pdf",
                contentLength = storedBytes.size.toLong(),
                originalFilename = "manual.pdf",
            )

        val response = controller.getPostFile(fileRequest(objectKey))

        assertThat(response.statusCode).isEqualTo(HttpStatus.OK)
        assertThat(response.headers.contentType.toString()).isEqualTo("application/pdf")
        assertThat(response.headers.contentLength).isEqualTo(storedBytes.size.toLong())
        assertThat(response.headers.getFirst(HttpHeaders.CONTENT_DISPOSITION)).contains("attachment").contains("manual.pdf")
        assertThat(response.headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff")
        assertThat(postImageStorageService.fileDownloads).containsExactly(objectKey)
    }

    @Test
    @DisplayName("게시글 첨부파일 다운로드는 비공개 게시글 연결 파일을 숨긴다")
    fun `files 다운로드는 비공개 게시글 연결 파일을 숨긴다`() {
        val objectKey = "posts/2026/03/private.pdf"
        val uploadedFile = postFile(objectKey).apply { attachToPost(20L, UploadedFilePurpose.POST_FILE) }
        `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)
        `when`(postRepository.findPublicDetailById(20L)).thenReturn(null)

        assertPostFileNotFound(objectKey)

        assertThat(postImageStorageService.fileDownloads).isEmpty()
    }

    @Test
    @DisplayName("게시글 첨부파일 다운로드는 TEMP PENDING_DELETE DELETED 파일을 숨긴다")
    fun `files 다운로드는 비활성 파일을 숨긴다`() {
        listOf(
            UploadedFileStatus.TEMP,
            UploadedFileStatus.PENDING_DELETE,
            UploadedFileStatus.DELETED,
        ).forEach { status ->
            val objectKey = "posts/2026/03/${status.name.lowercase()}.pdf"
            val uploadedFile =
                postFile(objectKey).apply {
                    this.status = status
                }
            `when`(uploadedFileRepository.findByObjectKey(objectKey)).thenReturn(uploadedFile)

            assertPostFileNotFound(objectKey)

            assertThat(postImageStorageService.fileDownloads).isEmpty()
            verifyNoInteractions(postRepository)
        }
    }

    private fun assertPostFileNotFound(objectKey: String) {
        assertThatThrownBy { controller.getPostFile(fileRequest(objectKey)) }
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("첨부 파일을 찾을 수 없습니다.")
    }

    private fun fileRequest(objectKey: String): MockHttpServletRequest = MockHttpServletRequest("GET", "/post/api/v1/files/$objectKey")

    private fun postFile(objectKey: String): UploadedFile =
        UploadedFile(
            objectKey = objectKey,
            bucket = "blog-images",
            contentType = "application/pdf",
            fileSize = 3L,
            purpose = UploadedFilePurpose.POST_FILE,
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
        var nextFileKey: String = "posts/placeholder/file.bin"
        var lastImageContentLength: Long? = null
        var lastFileContentLength: Long? = null
        var lastImageBytes: ByteArray = ByteArray(0)
        var lastFileBytes: ByteArray = ByteArray(0)
        val files = mutableMapOf<String, PostImageStoragePort.StoredObject>()
        val fileDownloads = mutableListOf<String>()

        override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String {
            lastImageContentLength = request.contentLength
            lastImageBytes = request.inputStream.use(InputStream::readBytes)
            return nextImageKey
        }

        override fun uploadPostFile(request: PostImageStoragePort.UploadFileRequest): String {
            lastFileContentLength = request.contentLength
            lastFileBytes = request.inputStream.use(InputStream::readBytes)
            return nextFileKey
        }

        override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject? = null

        override fun getPostFile(objectKey: String): PostImageStoragePort.StoredObject? {
            fileDownloads += objectKey
            return files[objectKey]
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
