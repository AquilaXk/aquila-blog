package com.back.boundedContexts.post.adapter.storage

import com.back.global.storage.application.ImageUploadAdmissionValidator
import java.nio.file.Path
import java.util.concurrent.Semaphore

internal class PostImageAdmissionValidator(
    decodeSemaphore: Semaphore? = null,
) {
    private val delegate =
        if (decodeSemaphore != null) {
            ImageUploadAdmissionValidator(decodeSemaphore)
        } else {
            ImageUploadAdmissionValidator()
        }

    fun validate(
        path: Path,
        declaredContentType: String?,
    ): ValidatedImage {
        val result = delegate.validate(path, declaredContentType)
        return ValidatedImage(
            contentType = result.contentType,
            extension = result.extension,
        )
    }

    internal fun validateBounds(
        width: Int,
        height: Int,
    ) {
        delegate.validateBounds(width, height)
    }

    internal fun validateDecodedPixelCount(pixelCount: Long) {
        delegate.validateDecodedPixelCount(pixelCount)
    }

    data class ValidatedImage(
        val contentType: String,
        val extension: String,
    )
}

internal fun normalizePostMediaContentType(raw: String?): String? = ImageUploadAdmissionValidator.normalizeImageMediaContentType(raw)
