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
    ): ValidatedImage = validate(path, declaredContentType, ImageValidationPolicy.POST_STRICT)

    fun validate(
        path: Path,
        declaredContentType: String?,
        policy: ImageValidationPolicy,
    ): ValidatedImage = validateWithReaders(path, declaredContentType, policy, ImageIO::getImageReaders)

    internal fun validateWithReaders(
        path: Path,
        declaredContentType: String?,
        imageReadersFactory: (ImageInputStream) -> Iterator<ImageReader>,
    ): ValidatedImage =
        validateWithReaders(
            path = path,
            declaredContentType = declaredContentType,
            policy = ImageValidationPolicy.POST_STRICT,
            imageReadersFactory = imageReadersFactory,
        )

    internal fun validateWithReaders(
        path: Path,
        declaredContentType: String?,
        policy: ImageValidationPolicy,
        imageReadersFactory: (ImageInputStream) -> Iterator<ImageReader>,
    ): ValidatedImage {
        val preScreened = preScreenImageHeader(path, declaredContentType, policy)
        if (preScreened.contentType == AVIF_CONTENT_TYPE) {
            preScreenAvifContainer(path, policy)
            return ValidatedImage(
                contentType = preScreened.contentType,
                extension = preScreened.extension,
            )
        }
        if (preScreened.contentType == ICO_CONTENT_TYPE) {
            preScreenIcoContainer(path, policy)
            return ValidatedImage(
                contentType = preScreened.contentType,
                extension = preScreened.extension,
            )
        }
        val imageInput = ImageIO.createImageInputStream(path.toFile()) ?: throw invalidImage()

        imageInput.use { input ->
            val readers = imageReadersFactory(input)
            if (!readers.hasNext()) throw invalidImage()

            val reader = readers.next()
            try {
                var hasDecoderWarning = false
                reader.addIIOReadWarningListener { _, _ -> hasDecoderWarning = true }
                reader.setInput(input, false, true)
                val canonicalFormat = canonicalFormat(reader.formatName, policy) ?: throw invalidImage()
                if (canonicalFormat.contentType != preScreened.contentType) {
                    throw invalidImage()
                }

                if (!policy.allowAnimated && canonicalFormat.contentType == PNG_CONTENT_TYPE) {
                    rejectAnimatedPng(path)
                }
                val decodedImage =
                    decodeWithConcurrencyLimit {
                        val imageCount = reader.getNumImages(true)
                        if (if (policy.allowAnimated) imageCount < 1 else imageCount != 1) {
                            throw invalidImage()
                        }

                        val width = reader.getWidth(0)
                        val height = reader.getHeight(0)
                        validateBounds(width, height, policy)
                        val step = computeSubsamplingStep(width, height)
                        val readParam =
                            reader.defaultReadParam.apply {
                                setSourceSubsampling(step, step, 0, 0)
                            }
                        reader.read(0, readParam)
                    } ?: throw invalidImage()
                if (hasDecoderWarning) throw invalidImage()
                validateBounds(decodedImage.width, decodedImage.height, policy)

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
    ) = validateBounds(width, height, ImageValidationPolicy.POST_STRICT)

    fun validateBounds(
        width: Int,
        height: Int,
        policy: ImageValidationPolicy,
    ) {
        if (width <= 0 || height <= 0 || width > policy.maxWidth || height > policy.maxHeight) {
            throw invalidImage()
        }
        validateDecodedPixelCount(width.toLong() * height.toLong(), policy)
    }

    fun validateDecodedPixelCount(pixelCount: Long) {
        validateDecodedPixelCount(pixelCount, ImageValidationPolicy.POST_STRICT)
    }

    fun validateDecodedPixelCount(
        pixelCount: Long,
        policy: ImageValidationPolicy,
    ) {
        if (pixelCount <= 0 || pixelCount > policy.maxDecodedPixels) throw invalidImage()
    }

    private fun computeSubsamplingStep(
        width: Int,
        height: Int,
    ): Int {
        val pixels = width.toLong() * height.toLong()
        if (pixels <= DECODE_TARGET_SAMPLE_PIXELS) return DECODE_SUBSAMPLING_STEP
        val ratio = (pixels + DECODE_TARGET_SAMPLE_PIXELS - 1L) / DECODE_TARGET_SAMPLE_PIXELS
        var step = DECODE_SUBSAMPLING_STEP
        while (step.toLong() * step.toLong() < ratio) {
            step += 1
        }
        return step
    }

    private fun preScreenImageHeader(
        path: Path,
        declaredContentType: String?,
        policy: ImageValidationPolicy,
    ): CanonicalImageFormat {
        val header = ByteArray(HEADER_PROBE_BYTES)
        val headerLength =
            BufferedInputStream(Files.newInputStream(path), IO_BUFFER_BYTES).use { stream ->
                readUpTo(stream, header, HEADER_PROBE_BYTES)
            }
        val detected = detectImageFormatFromHeader(header, headerLength, policy.allowExtendedRaster) ?: throw invalidImage()
        val normalizedDeclaredType = normalizeImageMediaContentType(declaredContentType)
        if (normalizedDeclaredType != null && normalizedDeclaredType != detected.contentType) {
            throw invalidImage()
        }
        if (detected.contentType == WEBP_CONTENT_TYPE) {
            preScreenWebpContainer(path, policy)
        }
        return detected
    }

    private fun preScreenWebpContainer(
        path: Path,
        policy: ImageValidationPolicy,
    ) {
        val fileSize = Files.size(path)
        if (fileSize < WEBP_MIN_FILE_BYTES) throw invalidImage()

        BufferedInputStream(Files.newInputStream(path), IO_BUFFER_BYTES).use { input ->
            preScreenWebpStream(input, fileSize, policy)
        }
    }

    internal fun preScreenWebpStream(
        input: InputStream,
        fileSize: Long,
    ) = preScreenWebpStream(input, fileSize, ImageValidationPolicy.POST_STRICT)

    internal fun preScreenWebpStream(
        input: InputStream,
        fileSize: Long,
        policy: ImageValidationPolicy,
    ) {
        if (fileSize < WEBP_MIN_FILE_BYTES) throw invalidImage()
        val riffHeader = ByteArray(RIFF_HEADER_BYTES)
        if (readFully(input, riffHeader, RIFF_HEADER_BYTES) != RIFF_HEADER_BYTES) {
            throw invalidImage()
        }
        if (readInt32BE(riffHeader, 0) != RIFF_WORD || readInt32BE(riffHeader, 8) != WEBP_WORD) {
            throw invalidImage()
        }
        val riffPayloadSize = readUint32LE(riffHeader, 4)
        val maxAvailablePayload = fileSize - RIFF_CHUNK_HEADER_BYTES
        // Allow at most 1 missing RIFF pad byte at EOF (matching real single-frame WebP streams) while failing closed on truncated containers.
        if (riffPayloadSize < WEBP_MIN_RIFF_PAYLOAD_BYTES || riffPayloadSize > maxAvailablePayload + 1L) {
            throw invalidImage()
        }
        val riffEnd = minOf(fileSize, RIFF_CHUNK_HEADER_BYTES.toLong() + riffPayloadSize)

        val chunkHeader = ByteArray(RIFF_CHUNK_HEADER_BYTES)
        val payloadHead = ByteArray(WEBP_VP8X_PAYLOAD_BYTES)
        var offset = RIFF_HEADER_BYTES.toLong()
        var chunkCount = 0
        var sawImageChunk = false

        while (offset + RIFF_CHUNK_HEADER_BYTES <= riffEnd) {
            chunkCount += 1
            if (chunkCount > MAX_PNG_CHUNKS) throw invalidImage()

            if (readFully(input, chunkHeader, RIFF_CHUNK_HEADER_BYTES) != RIFF_CHUNK_HEADER_BYTES) {
                throw invalidImage()
            }
            val chunkFourCc = readInt32BE(chunkHeader, 0)
            val chunkSize = readUint32LE(chunkHeader, 4)
            val remainingInRiff = riffEnd - offset - RIFF_CHUNK_HEADER_BYTES
            if (chunkSize > remainingInRiff) {
                throw invalidImage()
            }
            val paddedChunkSize = chunkSize + (chunkSize and 1L)
            val bytesToConsume = minOf(paddedChunkSize, remainingInRiff)

            if (!policy.allowAnimated && (chunkFourCc == WEBP_ANIM_CHUNK_WORD || chunkFourCc == WEBP_ANMF_CHUNK_WORD)) {
                throw invalidImage()
            }
            if (chunkCount == 1 && !isFirstWebpChunk(chunkFourCc)) {
                throw invalidImage()
            }

            var consumed = 0L
            when (chunkFourCc) {
                WEBP_VP8_CHUNK_WORD -> {
                    if (chunkSize < WEBP_VP8_HEADER_BYTES) throw invalidImage()
                    if (readFully(input, payloadHead, WEBP_VP8_HEADER_BYTES) != WEBP_VP8_HEADER_BYTES) {
                        throw invalidImage()
                    }
                    consumed = WEBP_VP8_HEADER_BYTES.toLong()
                    // RFC 6386 frame tag bit 0: 0=keyframe, 1=interframe; bytes 3..5: 0x9D 0x01 0x2A
                    if (
                        (payloadHead[0].toInt() and 0x01) != 0 ||
                        (payloadHead[3].toInt() and 0xFF) != 0x9D ||
                        (payloadHead[4].toInt() and 0xFF) != 0x01 ||
                        (payloadHead[5].toInt() and 0xFF) != 0x2A
                    ) {
                        throw invalidImage()
                    }
                    val width = (payloadHead[6].toInt() and 0xFF) or ((payloadHead[7].toInt() and 0x3F) shl 8)
                    val height = (payloadHead[8].toInt() and 0xFF) or ((payloadHead[9].toInt() and 0x3F) shl 8)
                    validateBounds(width, height, policy)
                    sawImageChunk = true
                }
                WEBP_VP8L_CHUNK_WORD -> {
                    if (chunkSize < WEBP_VP8L_HEADER_BYTES) throw invalidImage()
                    if (readFully(input, payloadHead, WEBP_VP8L_HEADER_BYTES) != WEBP_VP8L_HEADER_BYTES) {
                        throw invalidImage()
                    }
                    consumed = WEBP_VP8L_HEADER_BYTES.toLong()
                    if ((payloadHead[0].toInt() and 0xFF) != WEBP_VP8L_SIGNATURE_BYTE) {
                        throw invalidImage()
                    }
                    val packedDims = readInt32LE(payloadHead, 1)
                    val width = (packedDims and 0x3FFF) + 1
                    val height = ((packedDims ushr 14) and 0x3FFF) + 1
                    validateBounds(width, height, policy)
                    sawImageChunk = true
                }
                WEBP_VP8X_CHUNK_WORD -> {
                    if (chunkCount != 1 || chunkSize != WEBP_VP8X_PAYLOAD_BYTES.toLong()) {
                        throw invalidImage()
                    }
                    if (readFully(input, payloadHead, WEBP_VP8X_PAYLOAD_BYTES) != WEBP_VP8X_PAYLOAD_BYTES) {
                        throw invalidImage()
                    }
                    consumed = WEBP_VP8X_PAYLOAD_BYTES.toLong()
                    if (!policy.allowAnimated && (payloadHead[0].toInt() and WEBP_VP8X_ANIMATION_FLAG) != 0) {
                        throw invalidImage()
                    }
                    val canvasWidth = readUint24LE(payloadHead, 4) + 1
                    val canvasHeight = readUint24LE(payloadHead, 7) + 1
                    validateBounds(canvasWidth, canvasHeight, policy)
                    sawImageChunk = true
                }
            }

            if (bytesToConsume > consumed) {
                skipExact(input, bytesToConsume - consumed)
            }
            offset += RIFF_CHUNK_HEADER_BYTES + bytesToConsume
        }

        if (!sawImageChunk) throw invalidImage()
    }

    private fun isFirstWebpChunk(fourCc: Int): Boolean =
        fourCc == WEBP_VP8_CHUNK_WORD ||
            fourCc == WEBP_VP8L_CHUNK_WORD ||
            fourCc == WEBP_VP8X_CHUNK_WORD

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

    internal fun canonicalFormat(formatName: String): CanonicalImageFormat? = canonicalFormat(formatName, ImageValidationPolicy.POST_STRICT)

    internal fun canonicalFormat(
        formatName: String,
        policy: ImageValidationPolicy,
    ): CanonicalImageFormat? =
        when (formatName.trim().lowercase(Locale.ROOT)) {
            "jpeg", "jpg" -> CanonicalImageFormat(JPEG_CONTENT_TYPE, ".jpg")
            "png" -> CanonicalImageFormat(PNG_CONTENT_TYPE, ".png")
            "gif" -> CanonicalImageFormat(GIF_CONTENT_TYPE, ".gif")
            "webp" -> CanonicalImageFormat(WEBP_CONTENT_TYPE, ".webp")
            "bmp" -> if (policy.allowExtendedRaster) CanonicalImageFormat(BMP_CONTENT_TYPE, ".bmp") else null
            else -> null
        }

    private fun preScreenIcoContainer(
        path: Path,
        policy: ImageValidationPolicy,
    ) {
        val fileSize = Files.size(path)
        if (fileSize < ICO_HEADER_BYTES + ICO_ENTRY_BYTES || fileSize > MAX_ICO_FILE_BYTES) throw invalidImage()
        val bytes = Files.readAllBytes(path)
        val count = (bytes[4].toInt() and 0xFF) or ((bytes[5].toInt() and 0xFF) shl 8)
        if (count !in 1..MAX_ICO_IMAGES || bytes.size < ICO_HEADER_BYTES + count * ICO_ENTRY_BYTES) {
            throw invalidImage()
        }
        for (index in 0 until count) {
            val base = ICO_HEADER_BYTES + index * ICO_ENTRY_BYTES
            val width = (bytes[base].toInt() and 0xFF).let { if (it == 0) 256 else it }
            val height = (bytes[base + 1].toInt() and 0xFF).let { if (it == 0) 256 else it }
            validateBounds(width, height, policy)
            val dataSize = readUint32LE(bytes, base + 8)
            val dataOffset = readUint32LE(bytes, base + 12)
            if (dataSize <= 0 || dataOffset < ICO_HEADER_BYTES + count * ICO_ENTRY_BYTES || dataOffset + dataSize > fileSize) {
                throw invalidImage()
            }
        }
    }

    private fun preScreenAvifContainer(
        path: Path,
        policy: ImageValidationPolicy,
    ) {
        val fileSize = Files.size(path)
        if (fileSize < AVIF_MIN_FILE_BYTES) throw invalidImage()
        val probeLimit = minOf(fileSize, AVIF_HEADER_SCAN_LIMIT_BYTES).toInt()
        val buffer = ByteArray(probeLimit)
        BufferedInputStream(Files.newInputStream(path), IO_BUFFER_BYTES).use { stream ->
            if (readFully(stream, buffer, probeLimit) < AVIF_MIN_FILE_BYTES) throw invalidImage()
        }
        val dimensions = extractAvifDimensions(buffer, probeLimit) ?: throw invalidImage()
        validateBounds(dimensions.first, dimensions.second, policy)
    }

    private fun invalidImage(): AppException = AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 이미지 형식입니다.")

    data class ImageValidationPolicy(
        val maxWidth: Int,
        val maxHeight: Int,
        val maxDecodedPixels: Long,
        val allowAnimated: Boolean,
        val allowExtendedRaster: Boolean,
    ) {
        companion object {
            val POST_STRICT =
                ImageValidationPolicy(
                    maxWidth = MAX_IMAGE_WIDTH,
                    maxHeight = MAX_IMAGE_HEIGHT,
                    maxDecodedPixels = MAX_DECODED_PIXELS,
                    allowAnimated = false,
                    allowExtendedRaster = false,
                )

            val CLOUD_PHOTO =
                ImageValidationPolicy(
                    maxWidth = MAX_CLOUD_IMAGE_WIDTH,
                    maxHeight = MAX_CLOUD_IMAGE_HEIGHT,
                    maxDecodedPixels = MAX_CLOUD_DECODED_PIXELS,
                    allowAnimated = true,
                    allowExtendedRaster = true,
                )
        }
    }

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
        private const val MAX_CLOUD_IMAGE_WIDTH = 16_384
        private const val MAX_CLOUD_IMAGE_HEIGHT = 16_384
        private const val MAX_CLOUD_DECODED_PIXELS = 100_000_000L
        private const val DECODE_SUBSAMPLING_STEP = 4
        private const val DECODE_TARGET_SAMPLE_PIXELS = 4_194_304L
        private const val MAX_CONCURRENT_DECODES = 2
        private const val DECODE_WAIT_TIMEOUT_SECONDS = 30L
        private const val IO_BUFFER_BYTES = 8_192
        private const val HEADER_PROBE_BYTES = 64
        private const val PNG_SIGNATURE_BYTES = 8
        private const val PNG_CHUNK_HEADER_BYTES = 8
        private const val PNG_CRC_BYTES = 4L
        private const val PNG_CHUNK_OVERHEAD = 12L
        private const val MAX_PNG_CHUNKS = 65_536
        private const val ICO_HEADER_BYTES = 6
        private const val ICO_ENTRY_BYTES = 16
        private const val MAX_ICO_IMAGES = 64
        private const val MAX_ICO_FILE_BYTES = 2L * 1024 * 1024
        private const val AVIF_MIN_FILE_BYTES = 24L
        private const val AVIF_HEADER_SCAN_LIMIT_BYTES = 262_144L
        private const val MAX_ISOBMFF_DEPTH = 6

        private val PNG_SIGNATURE_WORD: Long = 0x8950_4E47_0D0A_1A0AuL.toLong()
        private const val APNG_ACTL_CHUNK_WORD = 0x6163_544C
        private const val PNG_IEND_CHUNK_WORD = 0x4945_4E44
        private const val GIF8_WORD = 0x4749_4638
        private const val RIFF_WORD = 0x5249_4646
        private const val WEBP_WORD = 0x5745_4250
        private const val WEBP_VP8_CHUNK_WORD = 0x5650_3820
        private const val WEBP_VP8L_CHUNK_WORD = 0x5650_384C
        private const val WEBP_VP8X_CHUNK_WORD = 0x5650_3858
        private const val WEBP_ANIM_CHUNK_WORD = 0x414E_494D
        private const val WEBP_ANMF_CHUNK_WORD = 0x414E_4D46
        private const val FTYP_BOX_WORD = 0x6674_7970
        private const val AVIF_BRAND_WORD = 0x6176_6966
        private const val AVIS_BRAND_WORD = 0x6176_6973
        private const val META_BOX_WORD = 0x6D65_7461
        private const val IPRP_BOX_WORD = 0x6970_7270
        private const val IPCO_BOX_WORD = 0x6970_636F
        private const val ISPE_BOX_WORD = 0x6973_7065
        private const val RIFF_HEADER_BYTES = 12
        private const val RIFF_CHUNK_HEADER_BYTES = 8
        private const val WEBP_MIN_FILE_BYTES = 20L
        private const val WEBP_MIN_RIFF_PAYLOAD_BYTES = 12L
        private const val WEBP_VP8_HEADER_BYTES = 10
        private const val WEBP_VP8L_HEADER_BYTES = 5
        private const val WEBP_VP8L_SIGNATURE_BYTE = 0x2F
        private const val WEBP_VP8X_PAYLOAD_BYTES = 10
        private const val WEBP_VP8X_ANIMATION_FLAG = 0x02

        private const val JPEG_CONTENT_TYPE = "image/jpeg"
        private const val PNG_CONTENT_TYPE = "image/png"
        private const val GIF_CONTENT_TYPE = "image/gif"
        private const val WEBP_CONTENT_TYPE = "image/webp"
        private const val BMP_CONTENT_TYPE = "image/bmp"
        private const val ICO_CONTENT_TYPE = "image/x-icon"
        private const val AVIF_CONTENT_TYPE = "image/avif"

        private val DEFAULT_DECODE_SEMAPHORE = Semaphore(MAX_CONCURRENT_DECODES, true)

        private val IMAGE_CONTENT_TYPE_ALIASES =
            mapOf(
                "image/jpg" to JPEG_CONTENT_TYPE,
                "image/pjpeg" to JPEG_CONTENT_TYPE,
                "image/x-png" to PNG_CONTENT_TYPE,
                "image/x-webp" to WEBP_CONTENT_TYPE,
                "image/x-ms-bmp" to BMP_CONTENT_TYPE,
                "image/vnd.microsoft.icon" to ICO_CONTENT_TYPE,
                "image/ico" to ICO_CONTENT_TYPE,
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
        ): CanonicalImageFormat? = detectImageFormatFromHeader(header, length, allowExtendedRaster = false)

        fun detectImageFormatFromHeader(
            header: ByteArray,
            length: Int,
            allowExtendedRaster: Boolean,
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
            if (!allowExtendedRaster) return null
            if (
                length >= 14 &&
                header[0] == 'B'.code.toByte() &&
                header[1] == 'M'.code.toByte()
            ) {
                return CanonicalImageFormat(BMP_CONTENT_TYPE, ".bmp")
            }
            if (
                length >= ICO_HEADER_BYTES &&
                header[0].toInt() == 0 &&
                header[1].toInt() == 0 &&
                header[2].toInt() == 1 &&
                header[3].toInt() == 0
            ) {
                return CanonicalImageFormat(ICO_CONTENT_TYPE, ".ico")
            }
            if (isAvifFtypHeader(header, length)) {
                return CanonicalImageFormat(AVIF_CONTENT_TYPE, ".avif")
            }
            return null
        }

        private fun isAvifFtypHeader(
            header: ByteArray,
            length: Int,
        ): Boolean {
            if (length < 12 || readInt32BE(header, 4) != FTYP_BOX_WORD) return false
            val boxSize = readUint32BE(header, 0).toInt().coerceIn(12, length)
            val majorBrand = readInt32BE(header, 8)
            if (majorBrand == AVIF_BRAND_WORD || majorBrand == AVIS_BRAND_WORD) return true
            var offset = 16
            while (offset + 4 <= boxSize) {
                val compatible = readInt32BE(header, offset)
                if (compatible == AVIF_BRAND_WORD || compatible == AVIS_BRAND_WORD) return true
                offset += 4
            }
            return false
        }

        internal fun extractAvifDimensions(
            bytes: ByteArray,
            length: Int,
            start: Int = 0,
            end: Int = length,
            depth: Int = 0,
        ): Pair<Int, Int>? {
            if (depth > MAX_ISOBMFF_DEPTH) return null
            var cursor = start
            var boxCount = 0
            while (cursor + 8 <= end) {
                boxCount += 1
                if (boxCount > 256) return null
                val rawSize = readUint32BE(bytes, cursor)
                val type = readInt32BE(bytes, cursor + 4)
                val headerSize = if (rawSize == 1L) 16 else 8
                val boxSizeLong =
                    when {
                        rawSize == 0L -> (end - cursor).toLong()
                        rawSize == 1L && cursor + 16 <= end -> readInt64BE(bytes, cursor + 8)
                        else -> rawSize
                    }
                if (boxSizeLong < headerSize || boxSizeLong > (end - cursor).toLong()) return null
                val boxEnd = (cursor + boxSizeLong).toInt()
                val payloadStart = cursor + headerSize
                when (type) {
                    ISPE_BOX_WORD -> {
                        if (boxEnd - payloadStart < 12) return null
                        val width = readInt32BE(bytes, payloadStart + 4)
                        val height = readInt32BE(bytes, payloadStart + 8)
                        return width to height
                    }
                    META_BOX_WORD -> {
                        if (payloadStart + 4 <= boxEnd) {
                            extractAvifDimensions(bytes, length, payloadStart + 4, boxEnd, depth + 1)?.let { return it }
                        }
                    }
                    IPRP_BOX_WORD, IPCO_BOX_WORD -> {
                        extractAvifDimensions(bytes, length, payloadStart, boxEnd, depth + 1)?.let { return it }
                    }
                }
                cursor = boxEnd
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

        fun readInt32LE(
            bytes: ByteArray,
            offset: Int,
        ): Int =
            (bytes[offset].toInt() and 0xFF) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 16) or
                ((bytes[offset + 3].toInt() and 0xFF) shl 24)

        fun readUint32LE(
            bytes: ByteArray,
            offset: Int,
        ): Long = readInt32LE(bytes, offset).toLong() and 0xFFFF_FFFFL

        fun readUint24LE(
            bytes: ByteArray,
            offset: Int,
        ): Int =
            (bytes[offset].toInt() and 0xFF) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 16)

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
