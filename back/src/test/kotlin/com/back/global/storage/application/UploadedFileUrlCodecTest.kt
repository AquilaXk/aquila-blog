package com.back.global.storage.application

import com.back.global.app.AppConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class UploadedFileUrlCodecTest {
    @BeforeEach
    fun setUp() {
        AppConfig("https://api.new-aquilaxk.site", "https://www.aquilaxk.site")
    }

    @Test
    fun `현재 absolute와 relative image file URL에서 encoded object key를 추출하고 retired host는 거부한다`() {
        val currentImage = "https://api.new-aquilaxk.site/post/api/v1/images/folder%2Fcover%20image.png?version=1#preview"
        val relativeImage = "/post/api/v1/images/folder%2Fcover%20image.png?version=1#preview"
        val currentFile = "https://api.new-aquilaxk.site/post/api/v1/files/docs%2Freport%20name.pdf?download=1#page-3"
        val relativeFile = "/post/api/v1/files/docs%2Freport%20name.pdf?download=1#page-3"
        val retiredImage = "https://api.aquilaxk.site/post/api/v1/images/folder%2Fcover%20image.png"

        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(currentImage)).isEqualTo("folder/cover image.png")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(relativeImage)).isEqualTo("folder/cover image.png")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromFileUrl(currentFile)).isEqualTo("docs/report name.pdf")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromFileUrl(relativeFile)).isEqualTo("docs/report name.pdf")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(retiredImage)).isNull()
    }
}
