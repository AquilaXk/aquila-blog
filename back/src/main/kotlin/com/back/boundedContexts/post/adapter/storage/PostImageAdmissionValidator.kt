package com.back.boundedContexts.post.adapter.storage

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import java.nio.file.Path
import java.util.Locale
import javax.imageio.ImageIO

internal class PostImageAdmissionValidator {
    fun validate(
        path: Path,
        declaredContentType: String?,
    ): ValidatedImage {
        val imageInput = ImageIO.createImageInputStream(path.toFile()) ?: rejectImage()

        imageInput.use { input ->
            val readers = ImageIO.getImageReaders(input)
            if (!readers.hasNext()) rejectImage()

            val reader = readers.next()
            try {
                reader.setInput(input, false, false)
                val canonicalFormat = canonicalFormat(reader.formatName) ?: rejectImage()
                val normalizedDeclaredType = normalizePostMediaContentType(declaredContentType)
                if (normalizedDeclaredType != null && normalizedDeclaredType != canonicalFormat.contentType) {
                    rejectImage()
                }

                if (reader.getNumImages(true) != 1) rejectImage()

                validateBounds(reader.getWidth(0), reader.getHeight(0))
                val decodedImage = reader.read(0) ?: rejectImage()
                validateBounds(decodedImage.width, decodedImage.height)

                return ValidatedImage(
                    contentType = canonicalFormat.contentType,
                    extension = canonicalFormat.extension,
                )
            } catch (error: AppException) {
                throw error
            } catch (_: Exception) {
                rejectImage()
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
            rejectImage()
        }
        validateDecodedPixelCount(width.toLong() * height.toLong())
    }

    internal fun validateDecodedPixelCount(pixelCount: Long) {
        if (pixelCount <= 0 || pixelCount > MAX_DECODED_PIXELS) rejectImage()
    }

    private fun canonicalFormat(formatName: String): CanonicalImageFormat? =
        when (formatName.trim().lowercase(Locale.ROOT)) {
            "jpeg", "jpg" -> CanonicalImageFormat("image/jpeg", ".jpg")
            "png" -> CanonicalImageFormat("image/png", ".png")
            "gif" -> CanonicalImageFormat("image/gif", ".gif")
            "webp" -> CanonicalImageFormat("image/webp", ".webp")
            else -> null
        }

    private fun rejectImage(): Nothing = throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 이미지 형식입니다.")

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
        "image/jpg" to "image/jpeg",
        "image/pjpeg" to "image/jpeg",
        "image/x-png" to "image/png",
        "image/x-webp" to "image/webp",
    )
