package com.back.global.storage.application

import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import java.io.BufferedInputStream
import java.io.EOFException
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.Locale
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO
import javax.imageio.ImageReader
import javax.imageio.stream.ImageInputStream

/**
 * Shared fail-closed image admission validator used across post and cloud storage.
 *
 * Open-source reference evaluation:
 * 1) Standalone Apache-2.0 metadata parser (`drewnoakes/metadata-extractor`): evaluated and omitted to
 *    avoid duplicating capabilities already covered by JDK `ImageIO` and `imageio-webp`.
 * 2) Existing dependencies: JDK `javax.imageio.ImageIO` (`ImageReader` header bounds and 4x4
 *    `ImageReadParam` subsampled decode) + declared `com.twelvemonkeys.imageio:imageio-webp` (BSD-3-Clause).
 * 3) Low-level adaptation: 8KB `BufferedInputStream` with 64-byte big-endian 32/64-bit word magic-byte
 *    screening, zero-allocation big-endian PNG chunk traversal (`acTL`/`IEND` with chunk-count limit),
 *    and bounded `Semaphore(2)` decode concurrency to cap heap memory under parallel uploads.
 */
class ImageUploadAdmissionValidator(
    private val decodeSemaphore: Semaphore = DEFAULT_DECODE_SEMAPHORE,
) {
    fun validate(
        path: Path,
        declaredContentType: String?,
    ): ValidatedImage = validateWithReaders(path, declaredContentType, ImageIO::getImageReaders)

    internal fun validateWithReaders(
        path: Path,
        declaredContentType: String?,
        imageReadersFactory: (ImageInputStream) -> Iterator<ImageReader>,
    ): ValidatedImage {
        val preScreened = preScreenImageHeader(path, declaredContentType)
        val imageInput = ImageIO.createImageInputStream(path.toFile()) ?: throw invalidImage()

        imageInput.use { input ->
            val readers = imageReadersFactory(input)
            if (!readers.hasNext()) throw invalidImage()

            val reader = readers.next()
            try {
                var hasDecoderWarning = false
                reader.addIIOReadWarningListener { _, _ -> hasDecoderWarning = true }
                reader.setInput(input, false, true)
                val canonicalFormat = canonicalFormat(reader.formatName) ?: throw invalidImage()
                if (canonicalFormat.contentType != preScreened.contentType) {
                    throw invalidImage()
                }

                if (canonicalFormat.contentType == PNG_CONTENT_TYPE) rejectAnimatedPng(path)
                if (reader.getNumImages(true) != 1) throw invalidImage()

                validateBounds(reader.getWidth(0), reader.getHeight(0))
                val decodedImage =
                    decodeWithConcurrencyLimit {
                        val readParam =
                            reader.defaultReadParam.apply {
                                setSourceSubsampling(DECODE_SUBSAMPLING_STEP, DECODE_SUBSAMPLING_STEP, 0, 0)
                            }
                        reader.read(0, readParam)
                    } ?: throw invalidImage()
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

    fun validateBounds(
        width: Int,
        height: Int,
    ) {
        if (width <= 0 || height <= 0 || width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT) {
            throw invalidImage()
        }
        validateDecodedPixelCount(width.toLong() * height.toLong())
    }

    fun validateDecodedPixelCount(pixelCount: Long) {
        if (pixelCount <= 0 || pixelCount > MAX_DECODED_PIXELS) throw invalidImage()
    }

    private fun preScreenImageHeader(
        path: Path,
        declaredContentType: String?,
    ): CanonicalImageFormat {
        val header = ByteArray(HEADER_PROBE_BYTES)
        val headerLength =
            BufferedInputStream(Files.newInputStream(path), IO_BUFFER_BYTES).use { stream ->
                readUpTo(stream, header, HEADER_PROBE_BYTES)
            }
        val detected = detectImageFormatFromHeader(header, headerLength) ?: throw invalidImage()
        val normalizedDeclaredType = normalizeImageMediaContentType(declaredContentType)
        if (normalizedDeclaredType != null && normalizedDeclaredType != detected.contentType) {
            throw invalidImage()
        }
        return detected
    }

    private fun <T> decodeWithConcurrencyLimit(block: () -> T): T {
        var acquired = false
        try {
            acquired = decodeSemaphore.tryAcquire(DECODE_WAIT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            throw invalidImage()
        }
        if (!acquired) {
            throw AppException(ErrorCode.SERVICE_UNAVAILABLE, "이미지 검증 동시성 한도를 초과했습니다.")
        }
        return try {
            block()
        } finally {
            decodeSemaphore.release()
        }
    }

    private fun rejectAnimatedPng(path: Path) {
        val fileSize = Files.size(path)
        if (fileSize < PNG_SIGNATURE_BYTES.toLong()) throw invalidImage()

        BufferedInputStream(Files.newInputStream(path), IO_BUFFER_BYTES).use { input ->
            rejectAnimatedPngStream(input, fileSize)
        }
    }

    internal fun rejectAnimatedPngStream(
        input: InputStream,
        fileSize: Long,
    ) {
        if (fileSize < PNG_SIGNATURE_BYTES.toLong()) throw invalidImage()
        val scratch = ByteArray(PNG_CHUNK_HEADER_BYTES)
        if (readFully(input, scratch, PNG_SIGNATURE_BYTES) != PNG_SIGNATURE_BYTES) {
            throw invalidImage()
        }
        if (readInt64BE(scratch, 0) != PNG_SIGNATURE_WORD) {
            throw invalidImage()
        }

        var offset = PNG_SIGNATURE_BYTES.toLong()
        var chunkCount = 0
        while (offset + PNG_CHUNK_OVERHEAD <= fileSize) {
            chunkCount += 1
            if (chunkCount > MAX_PNG_CHUNKS) throw invalidImage()

            if (readFully(input, scratch, PNG_CHUNK_HEADER_BYTES) != PNG_CHUNK_HEADER_BYTES) {
                throw invalidImage()
            }
            val dataLength = readUint32BE(scratch, 0)
            val chunkType = readInt32BE(scratch, 4)
            if (dataLength > fileSize - offset - PNG_CHUNK_OVERHEAD) {
                throw invalidImage()
            }
            if (chunkType == APNG_ACTL_CHUNK_WORD) {
                throw invalidImage()
            }

            skipExact(input, dataLength + PNG_CRC_BYTES)
            offset += PNG_CHUNK_OVERHEAD + dataLength
            if (chunkType == PNG_IEND_CHUNK_WORD) return
        }
        throw invalidImage()
    }

    internal fun canonicalFormat(formatName: String): CanonicalImageFormat? =
        when (formatName.trim().lowercase(Locale.ROOT)) {
            "jpeg", "jpg" -> CanonicalImageFormat(JPEG_CONTENT_TYPE, ".jpg")
            "png" -> CanonicalImageFormat(PNG_CONTENT_TYPE, ".png")
            "gif" -> CanonicalImageFormat(GIF_CONTENT_TYPE, ".gif")
            "webp" -> CanonicalImageFormat(WEBP_CONTENT_TYPE, ".webp")
            else -> null
        }

    private fun invalidImage(): AppException = AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 이미지 형식입니다.")

    data class ValidatedImage(
        val contentType: String,
        val extension: String,
    )

    data class CanonicalImageFormat(
        val contentType: String,
        val extension: String,
    )

    companion object {
        private const val MAX_IMAGE_WIDTH = 4_096
        private const val MAX_IMAGE_HEIGHT = 4_096
        private const val MAX_DECODED_PIXELS = 16_777_216L
        private const val DECODE_SUBSAMPLING_STEP = 4
        private const val MAX_CONCURRENT_DECODES = 2
        private const val DECODE_WAIT_TIMEOUT_SECONDS = 30L
        private const val IO_BUFFER_BYTES = 8_192
        private const val HEADER_PROBE_BYTES = 64
        private const val PNG_SIGNATURE_BYTES = 8
        private const val PNG_CHUNK_HEADER_BYTES = 8
        private const val PNG_CRC_BYTES = 4L
        private const val PNG_CHUNK_OVERHEAD = 12L
        private const val MAX_PNG_CHUNKS = 65_536

        private val PNG_SIGNATURE_WORD: Long = 0x8950_4E47_0D0A_1A0AuL.toLong()
        private const val APNG_ACTL_CHUNK_WORD = 0x6163_544C
        private const val PNG_IEND_CHUNK_WORD = 0x4945_4E44
        private const val GIF8_WORD = 0x4749_4638
        private const val RIFF_WORD = 0x5249_4646
        private const val WEBP_WORD = 0x5745_4250

        private const val JPEG_CONTENT_TYPE = "image/jpeg"
        private const val PNG_CONTENT_TYPE = "image/png"
        private const val GIF_CONTENT_TYPE = "image/gif"
        private const val WEBP_CONTENT_TYPE = "image/webp"

        private val DEFAULT_DECODE_SEMAPHORE = Semaphore(MAX_CONCURRENT_DECODES, true)

        private val IMAGE_CONTENT_TYPE_ALIASES =
            mapOf(
                "image/jpg" to JPEG_CONTENT_TYPE,
                "image/pjpeg" to JPEG_CONTENT_TYPE,
                "image/x-png" to PNG_CONTENT_TYPE,
                "image/x-webp" to WEBP_CONTENT_TYPE,
            )

        val ALLOWED_IMAGE_CONTENT_TYPES: Set<String> =
            setOf(
                JPEG_CONTENT_TYPE,
                PNG_CONTENT_TYPE,
                GIF_CONTENT_TYPE,
                WEBP_CONTENT_TYPE,
            )

        fun normalizeImageMediaContentType(raw: String?): String? {
            val normalized =
                raw
                    ?.substringBefore(";")
                    ?.trim()
                    ?.lowercase(Locale.ROOT)
                    .orEmpty()
            if (normalized.isBlank()) return null
            return IMAGE_CONTENT_TYPE_ALIASES[normalized] ?: normalized
        }

        fun detectImageFormatFromHeader(
            header: ByteArray,
            length: Int,
        ): CanonicalImageFormat? {
            if (
                length >= 3 &&
                (header[0].toInt() and 0xFF) == 0xFF &&
                (header[1].toInt() and 0xFF) == 0xD8 &&
                (header[2].toInt() and 0xFF) == 0xFF
            ) {
                return CanonicalImageFormat(JPEG_CONTENT_TYPE, ".jpg")
            }
            if (length >= PNG_SIGNATURE_BYTES && readInt64BE(header, 0) == PNG_SIGNATURE_WORD) {
                return CanonicalImageFormat(PNG_CONTENT_TYPE, ".png")
            }
            if (
                length >= 6 &&
                readInt32BE(header, 0) == GIF8_WORD &&
                (header[4] == '7'.code.toByte() || header[4] == '9'.code.toByte()) &&
                header[5] == 'a'.code.toByte()
            ) {
                return CanonicalImageFormat(GIF_CONTENT_TYPE, ".gif")
            }
            if (
                length >= 12 &&
                readInt32BE(header, 0) == RIFF_WORD &&
                readInt32BE(header, 8) == WEBP_WORD
            ) {
                return CanonicalImageFormat(WEBP_CONTENT_TYPE, ".webp")
            }
            return null
        }

        fun readUpTo(
            input: InputStream,
            buffer: ByteArray,
            maxBytes: Int,
        ): Int {
            var total = 0
            while (total < maxBytes) {
                val read = input.read(buffer, total, maxBytes - total)
                if (read < 0) break
                total += read
            }
            return total
        }

        fun readInt32BE(
            bytes: ByteArray,
            offset: Int,
        ): Int =
            ((bytes[offset].toInt() and 0xFF) shl 24) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 16) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 8) or
                (bytes[offset + 3].toInt() and 0xFF)

        fun readUint32BE(
            bytes: ByteArray,
            offset: Int,
        ): Long = readInt32BE(bytes, offset).toLong() and 0xFFFF_FFFFL

        fun readInt64BE(
            bytes: ByteArray,
            offset: Int,
        ): Long =
            ((readInt32BE(bytes, offset).toLong() and 0xFFFF_FFFFL) shl 32) or
                (readInt32BE(bytes, offset + 4).toLong() and 0xFFFF_FFFFL)

        private fun readFully(
            input: InputStream,
            buffer: ByteArray,
            length: Int,
        ): Int {
            var total = 0
            while (total < length) {
                val read = input.read(buffer, total, length - total)
                if (read < 0) break
                total += read
            }
            return total
        }

        internal fun skipExact(
            input: InputStream,
            count: Long,
        ) {
            var remaining = count
            while (remaining > 0) {
                val skipped = input.skip(remaining)
                if (skipped > 0) {
                    remaining -= skipped
                    continue
                }
                if (input.read() < 0) {
                    throw EOFException("Unexpected EOF while skipping PNG chunk payload")
                }
                remaining -= 1
            }
        }
    }
}
