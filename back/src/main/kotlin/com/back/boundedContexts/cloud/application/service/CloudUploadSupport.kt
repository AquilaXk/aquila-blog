package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import com.fasterxml.jackson.annotation.JsonInclude
import java.net.URLEncoder
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
private val UNSAFE_FOLDER_SEGMENT_REGEX = Regex("[^A-Za-z0-9._ -]")
private val UNSAFE_EXTENSION_CHAR_REGEX = Regex("[^a-z0-9]")
private val FILENAME_LINEBREAK_REGEX = Regex("[\\r\\n\\t]")
private val FILENAME_SLASH_REGEX = Regex("[/\\\\]")
private val FILENAME_CONTROL_REGEX = Regex("[\\p{Cc}\\p{Cf}\\p{Cs}]")
private val WHITESPACE_REGEX = Regex("\\s+")
private val MP4_FTYP_SIGNATURE = "ftyp".toByteArray(StandardCharsets.US_ASCII)
private val EBML_HEADER_SIGNATURE = byteArrayOf(0x1A.toByte(), 0x45.toByte(), 0xDF.toByte(), 0xA3.toByte())

internal fun normalizeContentType(raw: String?): String =
    raw
        ?.substringBefore(";")
        ?.trim()
        ?.lowercase(Locale.ROOT)
        .orEmpty()

internal fun normalizeFolderPath(folderPath: String?): String {
    val raw = folderPath?.trim()?.trim('/').orEmpty()
    if (raw.isBlank()) return ""
    if (
        raw.contains("..") ||
        raw.contains("//") ||
        raw.startsWith("/") ||
        raw.split('/').any { it.isBlank() || it == "." || it == ".." }
    ) {
        throw AppException(ErrorCode.BAD_REQUEST, "유효하지 않은 폴더 경로입니다.")
    }

    return raw
        .split('/')
        .joinToString("/") { segment ->
            segment.replace(UNSAFE_FOLDER_SEGMENT_REGEX, "_").take(80)
        }.take(500)
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
            "video/webm" -> "video/webm"
            else -> null
        }
    val fromExtension =
        when (extension) {
            "mp4", "m4v", "mov" -> "video/mp4"
            "webm" -> "video/webm"
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

internal fun isMp4Container(bytes: ByteArray): Boolean = bytes.size >= 12 && matchesPrefix(bytes, MP4_FTYP_SIGNATURE, offset = 4)

internal fun isWebmContainer(bytes: ByteArray): Boolean = matchesPrefix(bytes, EBML_HEADER_SIGNATURE)

internal fun detectVideoFromSignature(bytes: ByteArray): String? =
    when {
        isMp4Container(bytes) -> "video/mp4"
        isWebmContainer(bytes) -> "video/webm"
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
    val folderSegment = folderPath.takeIf(String::isNotBlank)?.let { "$it/" }.orEmpty()
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

private fun String.takeMetadataEncodedBytes(maxEncodedBytes: Int): String {
    val builder = StringBuilder()
    val iterator = codePoints().iterator()
    while (iterator.hasNext()) {
        val next = iterator.nextInt()
        val candidate = StringBuilder(builder).appendCodePoint(next).toString()
        if (metadataEncodedLength(candidate) > maxEncodedBytes) break
        builder.appendCodePoint(next)
    }

    return builder.toString()
}

private fun metadataEncodedLength(value: String): Int =
    URLEncoder
        .encode(value, StandardCharsets.UTF_8)
        .replace("+", "%20")
        .toByteArray(StandardCharsets.US_ASCII)
        .size

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
