package com.back.boundedContexts.post.adapter.web

import com.back.boundedContexts.post.application.port.output.PostImageStoragePort
import com.back.boundedContexts.post.config.PostImageStorageProperties
import com.back.global.app.AppConfig
import com.back.global.storage.application.UploadedFileRetentionService
import com.back.global.storage.domain.UploadedFilePurpose
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.springframework.mock.web.MockMultipartFile

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
    fun `posts images 업로드는 uploaded_file purpose를 POST_IMAGE로 저장한다`() {
        val file = MockMultipartFile("file", "sample.png", "image/png", "png".toByteArray())
        postImageStorageService.nextImageKey = "posts/2026/03/sample.png"

        val response = controller.uploadPostImage(file)

        assertThat(response.resultCode).isEqualTo("201-1")
        verify(uploadedFileRetentionService).registerTempUpload(
            "posts/2026/03/sample.png",
            "image/png",
            file.size,
            UploadedFilePurpose.POST_IMAGE,
        )
    }

    @Test
    fun `posts files 업로드는 uploaded_file purpose를 POST_FILE로 저장한다`() {
        val file = MockMultipartFile("file", "manual.pdf", "application/pdf", "pdf".toByteArray())
        postImageStorageService.nextFileKey = "posts/2026/03/manual.pdf"

        val response = controller.uploadPostFile(file)

        assertThat(response.resultCode).isEqualTo("201-2")
        verify(uploadedFileRetentionService).registerTempUpload(
            "posts/2026/03/manual.pdf",
            "application/pdf",
            file.size,
            UploadedFilePurpose.POST_FILE,
        )
    }

    private class FakePostImageStoragePort : PostImageStoragePort {
        var nextImageKey: String = "posts/placeholder/image.png"
        var nextFileKey: String = "posts/placeholder/file.bin"

        override fun uploadPostImage(request: PostImageStoragePort.UploadImageRequest): String = nextImageKey

        override fun uploadPostFile(request: PostImageStoragePort.UploadFileRequest): String = nextFileKey

        override fun getPostImage(objectKey: String): PostImageStoragePort.StoredObject? = null

        override fun getPostFile(objectKey: String): PostImageStoragePort.StoredObject? = null

        override fun deletePostImage(objectKey: String) {}

        override fun deletePostFile(objectKey: String) {}
    }
}
