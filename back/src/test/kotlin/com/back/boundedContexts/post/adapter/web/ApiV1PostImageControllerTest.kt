package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
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
                adminUsername = "",
                adminEmail = "",
                adminPassword = "",
            )
        }
    }

    private val postImageStorageService = FakePostImageStoragePort()
    private val uploadedFileRetentionService = mock(UploadedFileRetentionService::class.java)
    private val controller =
        ApiV1PostImageController(
            postImageStorageService = postImageStorageService,
            postImageStorageProperties = PostImageStorageProperties(maxFileSizeBytes = 10 * 1024 * 1024),
            uploadedFileRetentionService = uploadedFileRetentionService,
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

    private class FakePostImageStoragePort : PostImageStoragePort {
        var nextImageKey: String = "posts/placeholder/image.png"
        var nextFileKey: String = "posts/placeholder/file.bin"
        var lastImageContentLength: Long? = null
        var lastFileContentLength: Long? = null
        var lastImageBytes: ByteArray = ByteArray(0)
        var lastFileBytes: ByteArray = ByteArray(0)

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

        override fun getPostFile(objectKey: String): PostImageStoragePort.StoredObject? = null

        override fun deletePostImage(objectKey: String) {}

        override fun deletePostFile(objectKey: String) {}
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
