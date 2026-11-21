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

        val hashOnlyImage = "/post/api/v1/images/folder%2Fcover%20image.png#preview"
        val hashOnlyFile = "/post/api/v1/files/docs%2Freport%20name.pdf#top"

        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(currentImage)).isEqualTo("folder/cover image.png")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(relativeImage)).isEqualTo("folder/cover image.png")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(hashOnlyImage)).isEqualTo("folder/cover image.png")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromFileUrl(currentFile)).isEqualTo("docs/report name.pdf")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromFileUrl(relativeFile)).isEqualTo("docs/report name.pdf")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromFileUrl(hashOnlyFile)).isEqualTo("docs/report name.pdf")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(retiredImage)).isNull()
    }

    @Test
    fun `content 본문에서 query parameter 및 hash fragment가 포함된 경우에도 정규화된 object key를 추출한다`() {
        val content =
            """
            Here is a markdown image: ![Cover](${AppConfig.siteBackUrl}/post/api/v1/images/folder%2Fcover%20image.png?version=1#preview)
            And an HTML image: <img src="/post/api/v1/images/hero%20banner.png?width=1200&format=webp#top" />
            And a file download: [Download](https://api.new-aquilaxk.site/post/api/v1/files/docs%2Freport%20name.pdf?token=abc#section-2)
            And relative file: [Spec](/post/api/v1/files/spec.pdf)
            And a retired host image that must NOT be extracted: https://api.aquilaxk.site/post/api/v1/images/retired.png
            And another external site: https://external-domain.com/post/api/v1/images/malicious.png
            """.trimIndent()

        val imageKeys = UploadedFileUrlCodec.extractImageObjectKeysFromContent(content)
        val fileKeys = UploadedFileUrlCodec.extractFileObjectKeysFromContent(content)
        val allKeys = UploadedFileUrlCodec.extractObjectKeysFromContent(content)

        assertThat(imageKeys).containsExactlyInAnyOrder("folder/cover image.png", "hero banner.png")
        assertThat(fileKeys).containsExactlyInAnyOrder("docs/report name.pdf", "spec.pdf")
        assertThat(allKeys).containsExactlyInAnyOrder(
            "folder/cover image.png",
            "hero banner.png",
            "docs/report name.pdf",
            "spec.pdf",
        )
    }

    @Test
    fun `빈 본문이나 업로드 경로가 없는 본문은 빈 Set을 반환하고 단일 유형 본문도 정확히 추출한다`() {
        assertThat(UploadedFileUrlCodec.buildImageUrl("folder/cover image.png"))
            .isEqualTo("https://api.new-aquilaxk.site/post/api/v1/images/folder/cover%20image.png")
        assertThat(UploadedFileUrlCodec.buildFileUrl("docs/report name.pdf"))
            .isEqualTo("https://api.new-aquilaxk.site/post/api/v1/files/docs/report%20name.pdf")
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl(null)).isNull()
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl("   ")).isNull()
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl("/post/api/v1/images/?v=1")).isNull()
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromImageUrl("/post/api/v1/images/%ZZ")).isNull()

        assertThat(UploadedFileUrlCodec.extractObjectKeysFromContent("")).isEmpty()
        assertThat(UploadedFileUrlCodec.extractObjectKeysFromContent("   ")).isEmpty()
        assertThat(UploadedFileUrlCodec.extractObjectKeysFromContent("일반 텍스트와 외부 이미지 ![ext](https://example.com/a.png)")).isEmpty()
        assertThat(UploadedFileUrlCodec.extractObjectKeysFromContent("![img](/post/api/v1/images/only-image.png)"))
            .containsExactly("only-image.png")
        assertThat(UploadedFileUrlCodec.extractObjectKeysFromContent("[file](/post/api/v1/files/only-file.pdf)"))
            .containsExactly("only-file.pdf")
        assertThat(
            UploadedFileUrlCodec.extractObjectKeysFromContent(
                "![bad](${AppConfig.siteBackUrl}/post/api/v1/images/%ZZ) ![empty](${AppConfig.siteBackUrl}/post/api/v1/images/?v=1) " +
                    "![relbad](/post/api/v1/images/%ZZ) ![relempty](/post/api/v1/images/#frag)",
            ),
        ).isEmpty()
    }

    @Test
    fun `128 ASCII 및 유니코드 라운드트립과 경계 구분자, PartitionedObjectKeys 병합을 검증한다`() {
        val allAscii = (0..127).joinToString("") { it.toChar().toString() }
        val expectedEncodedAllAscii =
            java.net.URLEncoder
                .encode(allAscii, java.nio.charset.StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("%2F", "/")
        assertThat(UploadedFileUrlCodec.buildRelativeImagePath(allAscii))
            .isEqualTo("/post/api/v1/images/$expectedEncodedAllAscii")

        val unicodeKey = "폴더/caf\u00E9 한글 파일 명+특수#1?a=\uD83D\uDE80_고립_\uD83D_\uDC00.png"
        val relative = UploadedFileUrlCodec.buildRelativeFilePath(unicodeKey)
        assertThat(relative).startsWith("/post/api/v1/files/")
        val safeRoundTripKey = "폴더/caf\u00E9 한글 파일 명+100%_€_😀.pdf"
        assertThat(UploadedFileUrlCodec.extractObjectKeyFromFileUrl(UploadedFileUrlCodec.buildFileUrl(safeRoundTripKey)))
            .isEqualTo(safeRoundTripKey)

        val contentWithBoundaries =
            """
            /post/api/v1/images/start-of-doc.png
            [a](/post/api/v1/images/parens.png)
            [[/post/api/v1/images/bracket.png]
            "/post/api/v1/files/dquote.pdf"
            '/post/api/v1/files/squote.pdf'
            <span>/post/api/v1/files/gt.pdf</span>
            ${AppConfig.siteBackUrl}/post/api/v1/images/plus+name.png?x=1
            prefix/post/api/v1/images/attached-prefix-ignored.png
            한글/post/api/v1/images/non-ascii-prefix-ignored.png
            /post/api/v1/other/ignored.txt
            /post/api/v1/images/%20%20
            """.trimIndent()
        val partitioned = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(contentWithBoundaries)
        assertThat(partitioned.imageKeys).containsExactlyInAnyOrder(
            "start-of-doc.png",
            "parens.png",
            "bracket.png]",
            "plus name.png",
        )
        assertThat(partitioned.fileKeys).containsExactlyInAnyOrder(
            "dquote.pdf",
            "squote.pdf",
            "gt.pdf</span",
        )
        assertThat(partitioned.allKeys()).containsExactlyInAnyOrder(
            "start-of-doc.png",
            "parens.png",
            "bracket.png]",
            "plus name.png",
            "dquote.pdf",
            "squote.pdf",
            "gt.pdf</span",
        )

        val emptyPartitioned = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent("no urls")
        assertThat(emptyPartitioned.allKeys()).isEmpty()
    }

    @Test
    fun `PostAttachmentObjectKeySnapshot은 사전 추출된 키 재사용과 미제공 폴백을 모두 지원한다`() {
        val current = "![a](/post/api/v1/images/a.png) [f](/post/api/v1/files/f.pdf)"
        val preExtracted = UploadedFileUrlCodec.extractPartitionedObjectKeysFromContent(current)

        val reusedSnapshot =
            com.back.boundedContexts.post.application.service.PostAttachmentObjectKeySnapshot.fromContents(
                previousContent = null,
                currentContent = current,
                deletedContent = null,
                preExtractedCurrentKeys = preExtracted,
            )
        val fallbackSnapshot =
            com.back.boundedContexts.post.application.service.PostAttachmentObjectKeySnapshot.fromContents(
                previousContent = "![prev](/post/api/v1/images/p.png)",
                currentContent = current,
                deletedContent = null,
            )
        val deletedSnapshot =
            com.back.boundedContexts.post.application.service.PostAttachmentObjectKeySnapshot.fromContents(
                previousContent = null,
                currentContent = null,
                deletedContent = "![del](/post/api/v1/images/d.png) [df](/post/api/v1/files/df.pdf)",
            )
        val noopSnapshot =
            com.back.boundedContexts.post.application.service.PostAttachmentObjectKeySnapshot.fromContents(
                previousContent = null,
                currentContent = null,
                deletedContent = null,
            )

        assertThat(reusedSnapshot.currentImageObjectKeys).containsExactly("a.png")
        assertThat(reusedSnapshot.currentFileObjectKeys).containsExactly("f.pdf")
        assertThat(fallbackSnapshot.previousImageObjectKeys).containsExactly("p.png")
        assertThat(deletedSnapshot.deletedImageObjectKeys).containsExactly("d.png")
        assertThat(deletedSnapshot.deletedFileObjectKeys).containsExactly("df.pdf")
        assertThat(noopSnapshot.action)
            .isEqualTo(com.back.boundedContexts.post.application.service.PostAttachmentTaskAction.NONE)
    }
}
