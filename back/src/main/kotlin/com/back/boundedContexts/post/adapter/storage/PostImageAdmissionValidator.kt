package com.back.boundedContexts.post.adapter.storage

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import java.io.DataInputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.Locale
import javax.imageio.ImageIO

internal class PostImageAdmissionValidator {
    private val pngSignature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    fun validate(
        path: Path,
        declaredContentType: String?,
    ): ValidatedImage {
        val imageInput = ImageIO.createImageInputStream(path.toFile()) ?: throw invalidImage()

        imageInput.use { input ->
            val readers = ImageIO.getImageReaders(input)
            if (!readers.hasNext()) throw invalidImage()

            val reader = readers.next()
            try {
                var hasDecoderWarning = false
                reader.addIIOReadWarningListener { _, _ -> hasDecoderWarning = true }
                reader.setInput(input, false, true)
                val canonicalFormat = canonicalFormat(reader.formatName) ?: throw invalidImage()
                val normalizedDeclaredType = normalizePostMediaContentType(declaredContentType)
                if (normalizedDeclaredType != null && normalizedDeclaredType != canonicalFormat.contentType) {
                    throw invalidImage()
                }

                if (canonicalFormat.contentType == PNG_CONTENT_TYPE) rejectAnimatedPng(path)
                if (reader.getNumImages(true) != 1) throw invalidImage()

                validateBounds(reader.getWidth(0), reader.getHeight(0))
                val decodedImage = reader.read(0) ?: throw invalidImage()
                if (hasDecoderWarning) throw invalidImage()
                validateBounds(decodedImage.width, decodedImage.height)

                return ValidatedImage(
                    contentType = canonicalFormat.contentType,
                    extension = canonicalFormat.extension,
                )
            } catch (error: AppException) {
                throw error
            } catch (_: Exception) {
                throw invalidImage()
            } finally {
                reader.dispose()
            }
        }
    }

    internal fun validateBounds(
        width: Int,
        height: Int,
    ) {
        if (width <= 0 || height <= 0 || width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
            throw invalidImage()
        }
        validateDecodedPixelCount(width.toLong() * height.toLong())
    }

    internal fun validateDecodedPixelCount(pixelCount: Long) {
        if (pixelCount <= 0 || pixelCount > MAX_DECODED_PIXELS) throw invalidImage()
    }

    private fun rejectAnimatedPng(path: Path) {
        val fileSize = Files.size(path)
        DataInputStream(Files.newInputStream(path)).use { input ->
            if (!input.readNBytes(pngSignature.size).contentEquals(pngSignature)) throw invalidImage()

            var offset = pngSignature.size.toLong()
            while (offset + PNG_CHUNK_OVERHEAD <= fileSize) {
                val dataLength = input.readInt().toLong() and UINT32_MASK
                val typeBytes = input.readNBytes(PNG_CHUNK_TYPE_SIZE)
                if (typeBytes.size != PNG_CHUNK_TYPE_SIZE || dataLength > fileSize - offset - PNG_CHUNK_OVERHEAD) {
                    throw invalidImage()
                }

                val type = typeBytes.toString(Charsets.US_ASCII)
                if (type == APNG_ANIMATION_CONTROL_CHUNK) throw invalidImage()

                input.skipNBytes(dataLength)
                if (input.readNBytes(PNG_CRC_SIZE).size != PNG_CRC_SIZE) throw invalidImage()
                offset += PNG_CHUNK_OVERHEAD + dataLength
                if (type == PNG_END_CHUNK) return
            }
        }
        throw invalidImage()
    }

    private fun canonicalFormat(formatName: String): CanonicalImageFormat? =
        when (formatName.trim().lowercase(Locale.ROOT)) {
            "jpeg", "jpg" -> CanonicalImageFormat(JPEG_CONTENT_TYPE, ".jpg")
            "png" -> CanonicalImageFormat(PNG_CONTENT_TYPE, ".png")
            "gif" -> CanonicalImageFormat("image/gif", ".gif")
            "webp" -> CanonicalImageFormat("image/webp", ".webp")
            else -> null
        }

    private fun invalidImage(): AppException = AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 이미지 형식입니다.")

    data class ValidatedImage(
        val contentType: String,
        val extension: String,
    )

    private data class CanonicalImageFormat(
        val contentType: String,
        val extension: String,
    )

    private companion object {
        const val MAX_IMAGE_WIDTH = 4_096
        const val MAX_IMAGE_HEIGHT = 4_096
        const val MAX_DECODED_PIXELS = 16_777_216L
        const val PNG_CHUNK_TYPE_SIZE = 4
        const val PNG_CRC_SIZE = 4
        const val PNG_CHUNK_OVERHEAD = 12L
        const val UINT32_MASK = 0xFFFF_FFFFL
        const val APNG_ANIMATION_CONTROL_CHUNK = "acTL"
        const val PNG_END_CHUNK = "IEND"
    }
}

internal fun normalizePostMediaContentType(raw: String?): String? {
    val normalized =
        raw
            ?.substringBefore(";")
            ?.trim()
            ?.lowercase(Locale.ROOT)
            .orEmpty()
    if (normalized.isBlank()) return null
    return POST_MEDIA_CONTENT_TYPE_ALIASES[normalized] ?: normalized
}

private val POST_MEDIA_CONTENT_TYPE_ALIASES =
    mapOf(
        "image/jpg" to JPEG_CONTENT_TYPE,
        "image/pjpeg" to JPEG_CONTENT_TYPE,
        "image/x-png" to PNG_CONTENT_TYPE,
        "image/x-webp" to "image/webp",
    )

private const val JPEG_CONTENT_TYPE = "image/jpeg"
private const val PNG_CONTENT_TYPE = "image/png"
