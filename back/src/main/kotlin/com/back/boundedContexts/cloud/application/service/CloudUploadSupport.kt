package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.fasterxml.jackson.annotation.JsonInclude
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

data class CloudVideoUploadSessionDto(
    val id: Long,
    val ownerMemberId: Long,
    val originalFilename: String,
    val contentType: String,
    val byteSize: Long,
    val folderPath: String,
    val partSizeBytes: Long,
    val totalParts: Int,
    val uploadedParts: List<Int>,
    val status: CloudVideoUploadSessionStatus,
    val expiresAt: Instant,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val completedFileId: Long?,
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    val failureReason: String?,
)

data class CloudVideoUploadPartDto(
    val partNumber: Int,
    val byteSize: Long,
)

data class CloudVideoUploadPartResultDto(
    val session: CloudVideoUploadSessionDto,
    val part: CloudVideoUploadPartDto,
)

private val CLOUD_UPLOAD_DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd")
private const val MAX_FILENAME_CODE_POINTS = 255L
private const val MAX_FILENAME_METADATA_ENCODED_BYTES = 1024
private const val MAX_FOLDER_PATH_LENGTH = 180
private val UNSAFE_FOLDER_SEGMENT_REGEX = Regex("[^\\p{L}\\p{N}._ -]")
private val OBJECT_KEY_UNSAFE_SEGMENT_REGEX = Regex("[^A-Za-z0-9._-]")
private val REPEATED_UNDERSCORE_REGEX = Regex("_+")
private val UNSAFE_EXTENSION_CHAR_REGEX = Regex("[^a-z0-9]")
private val FILENAME_LINEBREAK_REGEX = Regex("[\\r\\n\\t]")
private val FILENAME_SLASH_REGEX = Regex("[/\\\\]")
private val FILENAME_CONTROL_REGEX = Regex("[\\p{Cc}\\p{Cf}\\p{Cs}]")
private val WHITESPACE_REGEX = Regex("\\s+")
private val EBML_HEADER_SIGNATURE = byteArrayOf(0x1A.toByte(), 0x45.toByte(), 0xDF.toByte(), 0xA3.toByte())
private const val ISOBMFF_FTYP_WORD = 0x6674_7970
private const val ISOBMFF_MOOV_WORD = 0x6D6F_6F76
private const val ISOBMFF_WIDE_WORD = 0x7769_6465
private const val ISOBMFF_MDAT_WORD = 0x6D64_6174
private const val ISOBMFF_FREE_WORD = 0x6672_6565
private const val ISOBMFF_SKIP_WORD = 0x736B_6970
private const val ISOBMFF_AVIF_BRAND = 0x6176_6966
private const val ISOBMFF_AVIS_BRAND = 0x6176_6973
private const val ISOBMFF_M4A_BRAND = 0x4D34_4120
private const val ISOBMFF_M4B_BRAND = 0x4D34_4220
private const val ISOBMFF_M4P_BRAND = 0x4D34_5020
private val EBML_DOCTYPE_WEBM = "webm".toByteArray(StandardCharsets.US_ASCII)
private val EBML_DOCTYPE_MATROSKA = "matroska".toByteArray(StandardCharsets.US_ASCII)

internal fun normalizeContentType(raw: String?): String =
    raw
        ?.substringBefore(";")
        ?.trim()
        ?.lowercase(Locale.ROOT)
        .orEmpty()

internal fun normalizeFolderPath(folderPath: String?): String {
    val raw =
        folderPath
            ?.let { Normalizer.normalize(it.trim(), Normalizer.Form.NFC) }
            ?.trim('/')
            .orEmpty()
    if (raw.isBlank()) return ""
    if (raw.contains("..") || raw.contains("//")) {
        throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 폴더 경로입니다.")
    }

    val normalized =
        raw
            .split('/')
            .joinToString("/") { segment ->
                val sanitized =
                    segment
                        .trim()
                        .replace(UNSAFE_FOLDER_SEGMENT_REGEX, "_")
                        .replace(WHITESPACE_REGEX, " ")
                        .replace(REPEATED_UNDERSCORE_REGEX, "_")
                        .trim()
                        .take(80)
                if (sanitized.isBlank() || sanitized == ".") {
                    throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 폴더 경로입니다.")
                }
                sanitized
            }
    if (normalized.length > MAX_FOLDER_PATH_LENGTH) {
        throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 폴더 경로입니다.")
    }
    return normalized
}

internal fun normalizeFilename(
    originalFilename: String?,
    defaultFallbackName: String,
): String {
    val raw =
        originalFilename
            ?.substringAfterLast('/')
            ?.substringAfterLast('\\')
            ?.trim()
            .orEmpty()
    val decoded = recoverUtf8MojibakeFilename(raw)
    val cleaned =
        Normalizer
            .normalize(decoded, Normalizer.Form.NFC)
            .ifBlank { defaultFallbackName }
            .replace(FILENAME_LINEBREAK_REGEX, " ")
            .replace(FILENAME_SLASH_REGEX, "_")
            .replace(FILENAME_CONTROL_REGEX, "")
            .replace(WHITESPACE_REGEX, " ")
            .takeFilenameLimits()
            .trim()

    return cleaned.ifBlank { defaultFallbackName }
}

internal fun extractLowerExtension(filename: String): String {
    val dotIndex = filename.lastIndexOf('.')
    if (dotIndex < 0 || dotIndex == filename.lastIndex) return ""
    return filename.substring(dotIndex + 1).lowercase(Locale.ROOT)
}

internal fun normalizeVideoContentType(
    contentType: String?,
    filename: String,
): String {
    val normalized = normalizeContentType(contentType)
    val extension = extractLowerExtension(filename)
    val fromContentType =
        when (normalized) {
            "video/mp4", "application/mp4" -> "video/mp4"
            "video/quicktime" -> "video/quicktime"
            "video/webm" -> "video/webm"
            "video/x-matroska", "video/matroska" -> "video/x-matroska"
            else -> null
        }
    val fromExtension =
        when (extension) {
            "mp4", "m4v" -> "video/mp4"
            "mov" -> "video/quicktime"
            "webm" -> "video/webm"
            "mkv" -> "video/x-matroska"
            else -> null
        }
    return fromContentType ?: fromExtension ?: throw AppException(ErrorCode.BAD_REQUEST, "지원하지 않는 동영상 파일 형식입니다.")
}

internal fun matchesPrefix(
    bytes: ByteArray,
    signature: ByteArray,
    offset: Int = 0,
): Boolean {
    if (offset < 0 || bytes.size < offset + signature.size) return false
    for (index in signature.indices) {
        if (bytes[offset + index] != signature[index]) return false
    }
    return true
}

internal fun isMp4OrQuickTimeContainer(bytes: ByteArray): Boolean {
    if (bytes.size < 8) return false
    val boxSize =
        ((bytes[0].toInt() and 0xFF).toLong() shl 24) or
            ((bytes[1].toInt() and 0xFF).toLong() shl 16) or
            ((bytes[2].toInt() and 0xFF).toLong() shl 8) or
            (bytes[3].toInt() and 0xFF).toLong()
    val validBoxSize = boxSize == 0L || boxSize == 1L || boxSize >= 8L
    if (!validBoxSize) return false
    val fourCc =
        ((bytes[4].toInt() and 0xFF) shl 24) or
            ((bytes[5].toInt() and 0xFF) shl 16) or
            ((bytes[6].toInt() and 0xFF) shl 8) or
            (bytes[7].toInt() and 0xFF)
    if (fourCc == ISOBMFF_FTYP_WORD) {
        if (bytes.size < 12) return false
        val majorBrand =
            ((bytes[8].toInt() and 0xFF) shl 24) or
                ((bytes[9].toInt() and 0xFF) shl 16) or
                ((bytes[10].toInt() and 0xFF) shl 8) or
                (bytes[11].toInt() and 0xFF)
        if (
            majorBrand == ISOBMFF_AVIF_BRAND ||
            majorBrand == ISOBMFF_AVIS_BRAND ||
            majorBrand == ISOBMFF_M4A_BRAND ||
            majorBrand == ISOBMFF_M4B_BRAND ||
            majorBrand == ISOBMFF_M4P_BRAND
        ) {
            return false
        }
        return true
    }
    return fourCc == ISOBMFF_MOOV_WORD ||
        fourCc == ISOBMFF_WIDE_WORD ||
        fourCc == ISOBMFF_MDAT_WORD ||
        fourCc == ISOBMFF_FREE_WORD ||
        fourCc == ISOBMFF_SKIP_WORD
}

internal fun isWebmContainer(bytes: ByteArray): Boolean = matchesPrefix(bytes, EBML_HEADER_SIGNATURE)

internal fun detectEbmlVideoContentType(
    bytes: ByteArray,
    declaredOrExtensionHint: String?,
): String? {
    if (!isWebmContainer(bytes)) return null
    val docType = findEbmlDocType(bytes)
    return when {
        docType == "matroska" -> "video/x-matroska"
        docType == "webm" -> "video/webm"
        declaredOrExtensionHint == "video/x-matroska" -> "video/x-matroska"
        else -> "video/webm"
    }
}

private fun findEbmlDocType(bytes: ByteArray): String? {
    val limit = minOf(bytes.size, 64)
    for (i in 4 until limit) {
        if (matchesPrefix(bytes, EBML_DOCTYPE_MATROSKA, offset = i)) return "matroska"
        if (matchesPrefix(bytes, EBML_DOCTYPE_WEBM, offset = i)) return "webm"
    }
    return null
}

internal fun detectVideoFromSignature(bytes: ByteArray): String? = detectVideoFromSignature(bytes, null)

internal fun detectVideoFromSignature(
    bytes: ByteArray,
    preferredContentType: String?,
): String? =
    when {
        isMp4OrQuickTimeContainer(bytes) ->
            if (preferredContentType == "video/quicktime") "video/quicktime" else "video/mp4"
        isWebmContainer(bytes) ->
            detectEbmlVideoContentType(bytes, preferredContentType)
        else -> null
    }

internal fun deleteTempFileQuietly(tempFile: Path) {
    runCatching { Files.deleteIfExists(tempFile) }
}

internal fun formatFileSizeLimit(maxFileSizeBytes: Long): String {
    val units = listOf("B", "KB", "MB", "GB")
    var value = maxFileSizeBytes.toDouble()
    var unitIndex = 0
    while (value >= 1024 && unitIndex < units.lastIndex) {
        value /= 1024
        unitIndex++
    }
    val formatted = if (value % 1.0 == 0.0) value.toLong().toString() else "%.1f".format(Locale.US, value)
    return "$formatted ${units[unitIndex]}"
}

internal fun buildObjectKey(
    ownerMemberId: Long,
    folderPath: String,
    originalFilename: String,
    keyPrefix: String,
    now: Instant,
): String {
    val ext = extractObjectKeyExtension(originalFilename)
    val datePath = CLOUD_UPLOAD_DATE_PATH_FORMATTER.format(now.atZone(ZoneOffset.UTC))
    val folderSegment = sanitizeObjectKeyFolderPath(folderPath)
    val normalizedKeyPrefix = normalizeObjectKeyPrefix(keyPrefix)
    return "$normalizedKeyPrefix/$ownerMemberId/$folderSegment$datePath/${UUID.randomUUID()}$ext"
}

internal fun CloudFile.toDto(clock: Clock): CloudFileDto =
    CloudFileDto(
        id = id,
        ownerMemberId = ownerMemberId,
        originalFilename = originalFilename,
        contentType = contentType,
        byteSize = byteSize,
        mediaKind = mediaKind,
        folderPath = folderPath,
        createdAt = runCatching { createdAt }.getOrDefault(clock.instant()),
        modifiedAt = runCatching { modifiedAt }.getOrDefault(clock.instant()),
        objectKey = objectKey,
        checksumSha256 = checksumSha256,
    )

internal fun CloudVideoUploadSession.toDto(parts: List<CloudVideoUploadPart>): CloudVideoUploadSessionDto =
    CloudVideoUploadSessionDto(
        id = id,
        ownerMemberId = ownerMemberId,
        originalFilename = originalFilename,
        contentType = contentType,
        byteSize = byteSize,
        folderPath = folderPath,
        partSizeBytes = partSizeBytes,
        totalParts = totalParts,
        uploadedParts = parts.map { it.partNumber }.sorted(),
        status = status,
        expiresAt = expiresAt,
        completedFileId = completedFileId,
        failureReason = failureReason,
    )

internal fun CloudVideoUploadPart.toDto(): CloudVideoUploadPartDto =
    CloudVideoUploadPartDto(
        partNumber = partNumber,
        byteSize = byteSize,
    )

private fun sanitizeObjectKeyFolderPath(folderPath: String): String {
    if (folderPath.isBlank()) return ""
    return folderPath
        .split('/')
        .joinToString("/") { segment ->
            val sanitized =
                segment
                    .replace(OBJECT_KEY_UNSAFE_SEGMENT_REGEX, "_")
                    .replace(REPEATED_UNDERSCORE_REGEX, "_")
            if (sanitized == "_") "folder" else sanitized
        }.let { "$it/" }
}

private fun normalizeObjectKeyPrefix(prefix: String): String =
    prefix
        .trim()
        .trim('/')
        .ifBlank { "cloud" }

private fun extractObjectKeyExtension(filename: String): String {
    if (!filename.contains(".")) return ""
    val ext =
        extractLowerExtension(filename)
            .replace(UNSAFE_EXTENSION_CHAR_REGEX, "")
            .take(10)
    return if (ext.isBlank()) "" else ".$ext"
}

private fun String.takeFilenameLimits(): String {
    val originalExtensionIndex = lastIndexOf(".").takeIf { it > 0 && it < lastIndex }
    val originalExtension =
        originalExtensionIndex
            ?.let(::substring)
            .orEmpty()
            .takeCodePoints(MAX_FILENAME_CODE_POINTS - 1)
    val originalStem = originalExtensionIndex?.let { substring(0, it) } ?: this
    val maxStemCodePoints =
        MAX_FILENAME_CODE_POINTS - originalExtension.codePointCount(0, originalExtension.length).toLong()
    val codePointLimited = originalStem.takeCodePoints(maxStemCodePoints.coerceAtLeast(0)) + originalExtension
    if (metadataEncodedLength(codePointLimited) <= MAX_FILENAME_METADATA_ENCODED_BYTES) return codePointLimited

    val extensionIndex = codePointLimited.lastIndexOf(".").takeIf { it > 0 && it < codePointLimited.lastIndex }
    val extension =
        extensionIndex
            ?.let(codePointLimited::substring)
            .orEmpty()
            .takeMetadataEncodedBytes(MAX_FILENAME_METADATA_ENCODED_BYTES)
    val stem = extensionIndex?.let { codePointLimited.substring(0, it) } ?: codePointLimited
    val maxStemBytes = MAX_FILENAME_METADATA_ENCODED_BYTES - metadataEncodedLength(extension)
    val safeStem = stem.takeMetadataEncodedBytes(maxStemBytes.coerceAtLeast(0))
    return (safeStem + extension).ifBlank { takeMetadataEncodedBytes(MAX_FILENAME_METADATA_ENCODED_BYTES) }
}

private fun String.takeCodePoints(maxCodePoints: Long): String {
    val codePoints = codePoints().limit(maxCodePoints).toArray()
    return String(codePoints, 0, codePoints.size)
}

private fun buildMask(
    vararg ranges: IntRange,
    chars: String,
): Long {
    var mask = 0L
    for (range in ranges) {
        for (bit in range) {
            mask = mask or (1L shl bit)
        }
    }
    for (ch in chars) {
        mask = mask or (1L shl (ch.code and 63))
    }
    return mask
}

private val UNENCODED_LOW_MASK: Long = buildMask(48..57, chars = "*-.")
private val UNENCODED_HIGH_MASK: Long = buildMask((65 - 64)..(90 - 64), (97 - 64)..(122 - 64), chars = "_")

internal fun String.takeMetadataEncodedBytes(maxEncodedBytes: Int): String {
    if (maxEncodedBytes <= 0 || isEmpty()) return ""
    var encodedBytes = 0
    var charIndex = 0
    while (charIndex < length) {
        val ch = this[charIndex]
        val charCount: Int
        val cpEncodedBytes: Int
        if (Character.isHighSurrogate(ch) && charIndex + 1 < length && Character.isLowSurrogate(this[charIndex + 1])) {
            charCount = 2
            cpEncodedBytes = 12
        } else {
            charCount = 1
            cpEncodedBytes = bmpMetadataEncodedLength(ch.code)
        }
        if (encodedBytes + cpEncodedBytes > maxEncodedBytes) break
        encodedBytes += cpEncodedBytes
        charIndex += charCount
    }
    return if (charIndex == length) this else substring(0, charIndex)
}

internal fun metadataEncodedLength(value: String): Int {
    var total = 0
    var index = 0
    while (index < value.length) {
        val ch = value[index]
        if (Character.isHighSurrogate(ch) && index + 1 < value.length && Character.isLowSurrogate(value[index + 1])) {
            total += 12
            index += 2
        } else {
            total += bmpMetadataEncodedLength(ch.code)
            index += 1
        }
    }
    return total
}

private fun bmpMetadataEncodedLength(codeUnit: Int): Int =
    when {
        codeUnit < 64 -> if (((UNENCODED_LOW_MASK ushr codeUnit) and 1L) != 0L) 1 else 3
        codeUnit < 128 -> if (((UNENCODED_HIGH_MASK ushr (codeUnit - 64)) and 1L) != 0L) 1 else 3
        codeUnit < 0x800 -> 6
        codeUnit in 0xD800..0xDFFF -> 3
        else -> 9
    }

private fun recoverUtf8MojibakeFilename(raw: String): String {
    if (raw.isBlank()) return raw
    if (raw.any { it in '가'..'힣' }) return raw

    val recovered =
        runCatching {
            String(raw.toByteArray(StandardCharsets.ISO_8859_1), StandardCharsets.UTF_8)
        }.getOrDefault(raw)

    if (recovered == raw || recovered.contains('\uFFFD')) return raw

    val rawHangulCount = raw.count { it in '가'..'힣' }
    val recoveredHangulCount = recovered.count { it in '가'..'힣' }
    return if (recoveredHangulCount > rawHangulCount) recovered else raw
}
