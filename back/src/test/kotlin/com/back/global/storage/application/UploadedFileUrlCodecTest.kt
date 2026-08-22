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
    fun `retired own-host storage URL만 현재 host로 canonicalize하고 encoded path query fragment를 보존한다`() {
        val url = "https://api.aquilaxk.site/post/api/v1/images/folder%2Fcover%20image.png?version=1#preview"

        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl(url))
            .isEqualTo("https://api.new-aquilaxk.site/post/api/v1/images/folder%2Fcover%20image.png?version=1#preview")
    }

    @Test
    fun `external relative and unrecognized URL은 canonicalize하지 않는다`() {
        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl("https://cdn.example.com/post/api/v1/images/a.png"))
            .isEqualTo("https://cdn.example.com/post/api/v1/images/a.png")
        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl("/post/api/v1/images/a.png"))
            .isEqualTo("/post/api/v1/images/a.png")
        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl("https://api.aquilaxk.site/member/api/v1/profile/a.png"))
            .isEqualTo("https://api.aquilaxk.site/member/api/v1/profile/a.png")
    }

    @Test
    fun `empty object key와 malformed percent URL은 content를 포함해 canonicalize하지 않는다`() {
        val emptyImageUrl = "https://api.aquilaxk.site/post/api/v1/images/"
        val emptyFileUrl = "https://api.aquilaxk.site/post/api/v1/files/?version=1"
        val malformedUrl = "https://api.aquilaxk.site/post/api/v1/images/%ZZ.png"
        val content = "![empty]($emptyImageUrl) [malformed]($malformedUrl)"

        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl(emptyImageUrl)).isEqualTo(emptyImageUrl)
        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl(emptyFileUrl)).isEqualTo(emptyFileUrl)
        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageUrl(malformedUrl)).isEqualTo(malformedUrl)
        assertThat(UploadedFileUrlCodec.canonicalizePublicStorageContent(content)).isEqualTo(content)
    }

    @Test
    fun `retired own-host image and file URL에서도 object key를 추출한다`() {
        val imageObjectKey =
            UploadedFileUrlCodec.extractObjectKeyFromImageUrl(
                "https://api.aquilaxk.site/post/api/v1/images/folder/file%20name.png?version=1",
            )
        val fileObjectKey =
            UploadedFileUrlCodec.extractObjectKeyFromFileUrl(
                "https://api.aquilaxk.site/post/api/v1/files/docs/file%20name.pdf",
            )

        assertThat(imageObjectKey).isEqualTo("folder/file name.png")
        assertThat(fileObjectKey)
            .isEqualTo("docs/file name.pdf")
    }
}
