package com.back.boundedContexts.post.adapter.storage

import com.back.global.exception.application.AppException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.nio.file.Files
import java.util.Base64
import java.util.zip.CRC32
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.stream.MemoryCacheImageOutputStream

@DisplayName("PostImageAdmissionValidator 테스트")
class PostImageAdmissionValidatorTest {
    private val validator = PostImageAdmissionValidator()

    @Test
    @DisplayName("JPEG PNG GIF WebP 단일 프레임을 실제 decoder로 허용한다")
    fun acceptsDecodedSingleFrameFormats() {
        val cases =
            listOf(
                ImageCase("jpg", createImage("jpeg"), "image/jpeg", ".jpg"),
                ImageCase("png", createImage("png"), "image/png", ".png"),
                ImageCase("gif", createImage("gif"), "image/gif", ".gif"),
                ImageCase("webp", Base64.getDecoder().decode(WEBP_1X1_BASE64), "image/webp", ".webp"),
            )

        cases.forEach { case ->
            withUpload(case.bytes, case.name) { path ->
                val result = validator.validate(path, case.contentType)

                assertThat(result.contentType).isEqualTo(case.contentType)
                assertThat(result.extension).isEqualTo(case.extension)
            }
        }
    }

    @Test
    @DisplayName("선언 MIME이 없으면 decoded canonical type을 사용한다")
    fun acceptsMissingDeclaredContentType() {
        withUpload(createImage("png"), "missing-type.png") { path ->
            val result = validator.validate(path, null)

            assertThat(result.contentType).isEqualTo("image/png")
            assertThat(result.extension).isEqualTo(".png")
        }
    }

    @Test
    @DisplayName("비어 있지 않은 선언 MIME mismatch를 거절한다")
    fun rejectsDeclaredContentTypeMismatch() {
        withUpload(createImage("png"), "spoof.png") { path ->
            assertBadRequest {
                validator.validate(path, "text/html")
            }
        }
    }

    @Test
    @DisplayName("signature만 있는 절단 이미지를 거절한다")
    fun rejectsTruncatedImage() {
        val signatureOnly =
            byteArrayOf(
                0x89.toByte(),
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A,
            )

        withUpload(signatureOnly, "truncated.png") { path ->
            assertBadRequest {
                validator.validate(path, "image/png")
            }
        }
    }

    @Test
    @DisplayName("reader가 선택된 뒤 깨진 이미지를 BAD_REQUEST로 변환한다")
    fun rejectsMalformedImageAfterReaderSelection() {
        val malformed = corruptPngImageData(createImage("png"))

        withUpload(malformed, "malformed.png") { path ->
            assertBadRequest {
                validator.validate(path, "image/png")
            }
        }
    }

    @Test
    @DisplayName("ImageIO reader가 있어도 retained set 밖 형식은 거절한다")
    fun rejectsDecodedFormatOutsideRetainedSet() {
        withUpload(createImage("bmp"), "unsupported.bmp") { path ->
            assertBadRequest {
                validator.validate(path, "image/bmp")
            }
        }
    }

    @Test
    @DisplayName("두 프레임 GIF를 거절한다")
    fun rejectsAnimatedGif() {
        withUpload(createAnimatedGif(), "animated.gif") { path ->
            assertBadRequest {
                validator.validate(path, "image/gif")
            }
        }
    }

    @Test
    @DisplayName("APNG animation chunk를 단일 PNG로 허용하지 않는다")
    fun rejectsApngAnimationChunk() {
        val animatedPng = insertPngChunk(createImage("png"), "acTL", byteArrayOf(0, 0, 0, 2, 0, 0, 0, 0))

        withUpload(animatedPng, "animated.png") { path ->
            assertBadRequest {
                validator.validate(path, "image/png")
            }
        }
    }

    @Test
    @DisplayName("decoder warning으로 복구되는 절단 JPEG를 거절한다")
    fun rejectsTruncatedJpegWithDecoderWarning() {
        val jpeg = createImage("jpeg")
        val withoutEndOfImage = jpeg.copyOf(jpeg.size - 2)

        withUpload(withoutEndOfImage, "truncated.jpg") { path ->
            assertBadRequest {
                validator.validate(path, "image/jpeg")
            }
        }
    }

    @Test
    @DisplayName("PNG ancillary metadata를 해제하지 않고 pixel만 검증한다")
    fun ignoresMalformedCompressedPngMetadata() {
        val malformedCompressedText = "Comment".toByteArray() + byteArrayOf(0, 0, 1, 2, 3, 4)
        val png = insertPngChunk(createImage("png"), "zTXt", malformedCompressedText)

        withUpload(png, "metadata.png") { path ->
            assertThatCode { validator.validate(path, "image/png") }.doesNotThrowAnyException()
        }
    }

    @Test
    @DisplayName("dimension과 decoded pixel 경계를 overflow 없이 검증한다")
    fun validatesDimensionAndPixelBoundaries() {
        assertThatCode { validator.validateBounds(4_096, 4_096) }.doesNotThrowAnyException()
        assertBadRequest { validator.validateBounds(4_097, 1) }
        assertBadRequest { validator.validateBounds(1, 4_097) }
        assertThatCode { validator.validateDecodedPixelCount(16_777_216L) }.doesNotThrowAnyException()
        assertBadRequest { validator.validateDecodedPixelCount(16_777_217L) }
    }

    private fun createImage(format: String): ByteArray {
        val image = BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB)
        image.setRGB(0, 0, 0x123456)
        return ByteArrayOutputStream().use { output ->
            check(ImageIO.write(image, format, output)) { "Missing test writer for $format" }
            output.toByteArray()
        }
    }

    private fun createAnimatedGif(): ByteArray {
        val writer = ImageIO.getImageWritersByFormatName("gif").next()
        return ByteArrayOutputStream().use { bytes ->
            MemoryCacheImageOutputStream(bytes).use { output ->
                writer.output = output
                writer.prepareWriteSequence(null)
                repeat(2) { frame ->
                    val image = BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB)
                    image.setRGB(0, 0, if (frame == 0) 0x000000 else 0xFFFFFF)
                    writer.writeToSequence(IIOImage(image, null, null), writer.defaultWriteParam)
                }
                writer.endWriteSequence()
            }
            writer.dispose()
            bytes.toByteArray()
        }
    }

    private fun insertPngChunk(
        png: ByteArray,
        type: String,
        data: ByteArray,
    ): ByteArray {
        val ihdrLength =
            ((png[8].toInt() and 0xFF) shl 24) or
                ((png[9].toInt() and 0xFF) shl 16) or
                ((png[10].toInt() and 0xFF) shl 8) or
                (png[11].toInt() and 0xFF)
        val insertAt = 8 + 12 + ihdrLength
        val typeBytes = type.toByteArray(Charsets.US_ASCII)
        val crc =
            CRC32().apply {
                update(typeBytes)
                update(data)
            }

        return ByteArrayOutputStream().use { bytes ->
            DataOutputStream(bytes).use { output ->
                output.write(png, 0, insertAt)
                output.writeInt(data.size)
                output.write(typeBytes)
                output.write(data)
                output.writeInt(crc.value.toInt())
                output.write(png, insertAt, png.size - insertAt)
            }
            bytes.toByteArray()
        }
    }

    private fun corruptPngImageData(png: ByteArray): ByteArray {
        val marker = "IDAT".toByteArray(Charsets.US_ASCII)
        val typeOffset =
            (0..png.size - marker.size)
                .first { offset -> marker.indices.all { index -> png[offset + index] == marker[index] } }
        return png.copyOf().also { corrupted ->
            corrupted[typeOffset + marker.size] = (corrupted[typeOffset + marker.size].toInt() xor 0xFF).toByte()
        }
    }

    private fun assertBadRequest(action: () -> Unit) {
        assertThatThrownBy(action)
            .isInstanceOf(AppException::class.java)
            .hasMessageContaining("400-1")
    }

    private fun withUpload(
        bytes: ByteArray,
        name: String,
        action: (java.nio.file.Path) -> Unit,
    ) {
        val path = Files.createTempFile("post-image-admission-", "-$name")
        try {
            Files.write(path, bytes)
            action(path)
        } finally {
            Files.deleteIfExists(path)
        }
    }

    private data class ImageCase(
        val name: String,
        val bytes: ByteArray,
        val contentType: String,
        val extension: String,
    )

    private companion object {
        const val WEBP_1X1_BASE64 =
            "UklGRkoAAABXRUJQVlA4ID4AAABQAgCdASoBAAEAAUAmJbACdAD0aEe/UP/+WoNI/Nt3/Zl88G7u93c4Pb/8/wv/1f1f+X/3f+R/y+/v9wAA"
    }
}
