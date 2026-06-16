package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

data class CloudFileDto(
    val id: Long,
    val ownerMemberId: Long,
    val originalFilename: String,
    val contentType: String,
    val byteSize: Long,
    val mediaKind: CloudFileMediaKind,
    val folderPath: String,
    val createdAt: Instant,
    val modifiedAt: Instant,
)

data class CloudFileContent(
    val file: CloudFileDto,
    val storedObject: CloudStoragePort.StoredObject,
)

@Service
class CloudFileService(
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val cloudStoragePort: CloudStoragePort,
    private val cloudStorageProperties: CloudStorageProperties = CloudStorageProperties(),
    private val clock: Clock = Clock.systemUTC(),
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun upload(
        ownerMemberId: Long,
        originalFilename: String?,
        clientOriginalFilename: String? = null,
        contentType: String?,
        bytes: ByteArray,
        folderPath: String?,
    ): CloudFileDto {
        if (bytes.isEmpty()) throw AppException("400-1", "클라우드 파일이 비어 있습니다.")
        val normalizedFolderPath = normalizeFolderPath(folderPath)
        val safeFilename = normalizeFilename(clientOriginalFilename?.takeIf(String::isNotBlank) ?: originalFilename)
        val detected = detectContent(bytes, contentType, safeFilename)
        validateFileSize(bytes.size.toLong(), detected)
        val objectKey =
            buildObjectKey(
                ownerMemberId = ownerMemberId,
                folderPath = normalizedFolderPath,
                originalFilename = safeFilename,
            )

        // 선언 MIME만 믿지 않고 파일 시그니처로 media kind를 확정해 preview spoofing을 막는다.
        val uploadResult =
            cloudStoragePort.upload(
                CloudStoragePort.UploadRequest(
                    objectKey = objectKey,
                    bytes = bytes,
                    contentType = detected.contentType,
                    originalFilename = safeFilename,
                ),
            )

        val saved =
            cloudFileRepository.save(
                CloudFile.create(
                    ownerMemberId = ownerMemberId,
                    objectKey = uploadResult.objectKey,
                    originalFilename = safeFilename,
                    contentType = detected.contentType,
                    byteSize = bytes.size.toLong(),
                    mediaKind = detected.mediaKind,
                    folderPath = normalizedFolderPath,
                    checksumSha256 = uploadResult.checksumSha256,
                ),
            )

        return saved.toDto()
    }

    @Transactional(readOnly = true)
    fun listFiles(
        ownerMemberId: Long,
        folderPath: String?,
        keyword: String?,
        mediaKind: CloudFileMediaKind?,
    ): List<CloudFileDto> =
        cloudFileRepository
            .findActiveByOwner(
                ownerMemberId = ownerMemberId,
                folderPath = normalizeOptionalFolderPath(folderPath),
                keyword = keyword?.trim()?.takeIf(String::isNotBlank),
                mediaKind = mediaKind,
            ).map { it.toDto() }

    @Transactional(readOnly = true)
    fun get(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFileDto =
        cloudFileRepository
            .findActiveByIdAndOwner(fileId, ownerMemberId)
            ?.toDto()
            ?: throw AppException("404-1", "클라우드 파일을 찾을 수 없습니다.")

    @Transactional(readOnly = true)
    fun openContent(
        ownerMemberId: Long,
        fileId: Long,
    ): CloudFileContent {
        // owner check가 storage open보다 먼저 실행되어야 비소유자가 object 존재 여부를 추론할 수 없다.
        val file =
            cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
                ?: throw AppException("404-1", "클라우드 파일을 찾을 수 없습니다.")
        val storedObject =
            cloudStoragePort.open(file.objectKey)
                ?: throw AppException("404-1", "클라우드 파일을 찾을 수 없습니다.")

        return CloudFileContent(
            file = file.toDto(),
            storedObject = storedObject,
        )
    }

    @Transactional
    fun delete(
        ownerMemberId: Long,
        fileId: Long,
    ) {
        val file =
            cloudFileRepository.findActiveByIdAndOwner(fileId, ownerMemberId)
                ?: throw AppException("404-1", "클라우드 파일을 찾을 수 없습니다.")

        val objectKey = file.objectKey
        file.markDeleted(clock.instant())
        cloudFileRepository.save(file)
        deleteObjectAfterCommit(objectKey)
    }

    private fun deleteObjectAfterCommit(objectKey: String) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            cloudStoragePort.delete(objectKey)
            return
        }

        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() {
                    runCatching { cloudStoragePort.delete(objectKey) }
                        .onFailure {
                            logger.error(
                                "Cloud file object delete failed after metadata commit (objectKey={})",
                                objectKey,
                                it,
                            )
                        }
                }
            },
        )
    }

    private fun CloudFile.toDto(): CloudFileDto =
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

    private fun normalizeOptionalFolderPath(folderPath: String?): String? = normalizeFolderPath(folderPath).takeIf(String::isNotBlank)

    private fun normalizeFolderPath(folderPath: String?): String {
        val raw = folderPath?.trim()?.trim('/').orEmpty()
        if (raw.isBlank()) return ""
        if (
            raw.contains("..") ||
            raw.contains("//") ||
            raw.startsWith("/") ||
            raw.split('/').any { it.isBlank() || it == "." || it == ".." }
        ) {
            throw AppException("400-1", "유효하지 않은 폴더 경로입니다.")
        }

        val cleaned =
            raw
                .split('/')
                .joinToString("/") { segment ->
                    segment.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(80)
                }.take(500)

        return cleaned
    }

    private fun normalizeFilename(originalFilename: String?): String {
        val fallback = "cloud-file"
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
                .ifBlank { fallback }
                .replace(Regex("[\\r\\n\\t]"), " ")
                .replace(Regex("[/\\\\]"), "_")
                .replace(Regex("[\\p{Cc}\\p{Cf}\\p{Cs}]"), "")
                .replace(Regex("\\s+"), " ")
                .takeFilenameLimits()
                .trim()

        return cleaned.ifBlank { fallback }
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

    private fun validateFileSize(
        byteSize: Long,
        detected: DetectedContent,
    ) {
        val limit = resolveUploadLimit(detected)
        if (byteSize <= limit.maxBytes) return

        throw AppException(
            "413-1",
            "클라우드 ${limit.label} 파일은 ${formatFileSizeLimit(limit.maxBytes)} 이하여야 합니다.",
        )
    }

    private fun resolveUploadLimit(detected: DetectedContent): UploadLimit {
        val typeLimit =
            when {
                detected.contentType == ZIP_CONTENT_TYPE ->
                    UploadLimit("ZIP", cloudStorageProperties.cloudArchiveMaxFileSizeBytes)
                detected.mediaKind == CloudFileMediaKind.PHOTO ->
                    UploadLimit("사진", cloudStorageProperties.cloudPhotoMaxFileSizeBytes)
                detected.mediaKind == CloudFileMediaKind.VIDEO ->
                    UploadLimit("동영상", cloudStorageProperties.cloudVideoMaxFileSizeBytes)
                else ->
                    UploadLimit("문서", cloudStorageProperties.cloudDocumentMaxFileSizeBytes)
            }

        val effectiveMaxBytes = minOf(typeLimit.maxBytes, cloudStorageProperties.maxFileSizeBytes)
        return typeLimit.copy(maxBytes = effectiveMaxBytes)
    }

    private fun formatFileSizeLimit(maxFileSizeBytes: Long): String {
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

    private fun buildObjectKey(
        ownerMemberId: Long,
        folderPath: String,
        originalFilename: String,
    ): String {
        val ext = extractExtension(originalFilename)
        val datePath = DATE_PATH_FORMATTER.format(clock.instant().atZone(ZoneOffset.UTC))
        val folderSegment = folderPath.takeIf(String::isNotBlank)?.let { "$it/" }.orEmpty()
        return "cloud/$ownerMemberId/$folderSegment$datePath/${UUID.randomUUID()}$ext"
    }

    private fun extractExtension(filename: String): String {
        if (!filename.contains(".")) return ""
        val ext =
            filename
                .substringAfterLast(".")
                .lowercase(Locale.ROOT)
                .replace(Regex("[^a-z0-9]"), "")
                .take(10)
        return if (ext.isBlank()) "" else ".$ext"
    }

    private fun detectContent(
        bytes: ByteArray,
        declaredContentType: String?,
        filename: String,
    ): DetectedContent {
        val normalizedDeclared = normalizeContentType(declaredContentType)
        val detected =
            detectFromSignature(bytes, filename)
                ?: throw AppException("400-1", "지원하지 않는 클라우드 파일 형식입니다.")

        if (
            normalizedDeclared != null &&
            normalizedDeclared in KNOWN_CONTENT_TYPES &&
            !isDeclaredContentTypeCompatible(normalizedDeclared, detected.contentType)
        ) {
            throw AppException("400-1", "파일 내용과 콘텐츠 타입이 일치하지 않습니다.")
        }

        return detected
    }

    private fun isDeclaredContentTypeCompatible(
        declaredContentType: String,
        detectedContentType: String,
    ): Boolean =
        declaredContentType == detectedContentType ||
            (detectedContentType == HWPX_CONTENT_TYPE && declaredContentType == ZIP_CONTENT_TYPE)

    private fun normalizeContentType(raw: String?): String? {
        val normalized =
            raw
                ?.substringBefore(";")
                ?.trim()
                ?.lowercase(Locale.ROOT)
                .orEmpty()
        if (normalized.isBlank()) return null
        return CONTENT_TYPE_ALIASES[normalized] ?: normalized
    }

    private fun detectFromSignature(
        bytes: ByteArray,
        filename: String,
    ): DetectedContent? {
        if (bytes.size >= 5 && bytes.copyOfRange(0, 5).toString(Charsets.US_ASCII) == "%PDF-") {
            return DetectedContent("application/pdf", CloudFileMediaKind.DOCUMENT)
        }
        if (
            bytes.size >= 3 &&
            bytes[0] == 0xFF.toByte() &&
            bytes[1] == 0xD8.toByte() &&
            bytes[2] == 0xFF.toByte()
        ) {
            return DetectedContent("image/jpeg", CloudFileMediaKind.PHOTO)
        }
        if (
            bytes.size >= 8 &&
            bytes[0] == 0x89.toByte() &&
            bytes[1] == 0x50.toByte() &&
            bytes[2] == 0x4E.toByte() &&
            bytes[3] == 0x47.toByte() &&
            bytes[4] == 0x0D.toByte() &&
            bytes[5] == 0x0A.toByte() &&
            bytes[6] == 0x1A.toByte() &&
            bytes[7] == 0x0A.toByte()
        ) {
            return DetectedContent("image/png", CloudFileMediaKind.PHOTO)
        }
        if (bytes.size >= 6) {
            val header = bytes.copyOfRange(0, 6).toString(Charsets.US_ASCII)
            if (header == "GIF87a" || header == "GIF89a") return DetectedContent("image/gif", CloudFileMediaKind.PHOTO)
        }
        if (bytes.size >= 12) {
            val riff = bytes.copyOfRange(0, 4).toString(Charsets.US_ASCII)
            val webp = bytes.copyOfRange(8, 12).toString(Charsets.US_ASCII)
            if (riff == "RIFF" && webp == "WEBP") return DetectedContent("image/webp", CloudFileMediaKind.PHOTO)
        }
        if (bytes.size >= 12 && bytes.copyOfRange(4, 8).toString(Charsets.US_ASCII) == "ftyp") {
            return DetectedContent("video/mp4", CloudFileMediaKind.VIDEO)
        }
        if (
            bytes.size >= 4 &&
            bytes[0] == 0x1A.toByte() &&
            bytes[1] == 0x45.toByte() &&
            bytes[2] == 0xDF.toByte() &&
            bytes[3] == 0xA3.toByte()
        ) {
            return DetectedContent("video/webm", CloudFileMediaKind.VIDEO)
        }
        if (filename.substringAfterLast(".", "").lowercase(Locale.ROOT) == "hwpx" && isHwpxPackage(bytes)) {
            return DetectedContent(HWPX_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
        }
        if (filename.substringAfterLast(".", "").lowercase(Locale.ROOT) == "zip" && isValidZipArchive(bytes)) {
            return DetectedContent(ZIP_CONTENT_TYPE, CloudFileMediaKind.DOCUMENT)
        }

        return null
    }

    private fun isZipSignature(bytes: ByteArray): Boolean =
        bytes.size >= 4 &&
            bytes.copyOfRange(0, 4).toList() in ZIP_SIGNATURES

    private fun isHwpxPackage(bytes: ByteArray): Boolean {
        if (!isZipSignature(bytes)) return false

        val entries = readZipCentralDirectoryEntryNames(bytes)

        return HWPX_MANIFEST_ENTRY in entries && entries.any { it in HWPX_DOCUMENT_ENTRIES }
    }

    private fun isValidZipArchive(bytes: ByteArray): Boolean = isZipSignature(bytes) && parseZipCentralDirectoryEntryNames(bytes) != null

    private fun readZipCentralDirectoryEntryNames(bytes: ByteArray): Set<String> = parseZipCentralDirectoryEntryNames(bytes).orEmpty()

    private fun parseZipCentralDirectoryEntryNames(bytes: ByteArray): Set<String>? {
        val endRecordOffset = findZipEndOfCentralDirectoryOffset(bytes) ?: return null
        val entryCount = readUInt16Le(bytes, endRecordOffset + ZIP_EOCD_TOTAL_ENTRY_COUNT_OFFSET)
        val centralDirectorySize = readUInt32Le(bytes, endRecordOffset + ZIP_EOCD_DIRECTORY_SIZE_OFFSET)
        val centralDirectoryOffset = readUInt32Le(bytes, endRecordOffset + ZIP_EOCD_DIRECTORY_OFFSET)
        if (centralDirectorySize > bytes.size || centralDirectoryOffset > bytes.size) return null

        val directoryStart = centralDirectoryOffset.toInt()
        val directoryEnd = (centralDirectoryOffset + centralDirectorySize).takeIf { it <= bytes.size }?.toInt() ?: return null
        val names = mutableSetOf<String>()
        var offset = directoryStart
        var scannedCount = 0

        while (
            offset + ZIP_CENTRAL_DIRECTORY_HEADER_SIZE <= directoryEnd &&
            scannedCount < entryCount
        ) {
            if (!hasSignature(bytes, offset, ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE)) return null

            val nameLength = readUInt16Le(bytes, offset + ZIP_CENTRAL_DIRECTORY_NAME_LENGTH_OFFSET)
            val extraLength = readUInt16Le(bytes, offset + ZIP_CENTRAL_DIRECTORY_EXTRA_LENGTH_OFFSET)
            val commentLength = readUInt16Le(bytes, offset + ZIP_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET)
            val nameOffset = offset + ZIP_CENTRAL_DIRECTORY_HEADER_SIZE
            val nextOffset = nameOffset + nameLength + extraLength + commentLength
            if (nameOffset + nameLength > directoryEnd || nextOffset > directoryEnd) return null

            names += String(bytes, nameOffset, nameLength, StandardCharsets.UTF_8).replace('\\', '/')
            offset = nextOffset
            scannedCount++
        }

        if (scannedCount != entryCount || offset != directoryEnd) return null

        return names
    }

    private fun findZipEndOfCentralDirectoryOffset(bytes: ByteArray): Int? {
        val firstSearchOffset = maxOf(0, bytes.size - ZIP_EOCD_MAX_SEARCH_LENGTH)
        for (offset in bytes.size - ZIP_EOCD_MIN_SIZE downTo firstSearchOffset) {
            if (hasSignature(bytes, offset, ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE)) return offset
        }
        return null
    }

    private fun hasSignature(
        bytes: ByteArray,
        offset: Int,
        signature: ByteArray,
    ): Boolean {
        if (offset < 0 || offset + signature.size > bytes.size) return false
        return signature.indices.all { index -> bytes[offset + index] == signature[index] }
    }

    private fun readUInt16Le(
        bytes: ByteArray,
        offset: Int,
    ): Int =
        (bytes[offset].toInt() and 0xFF) or
            ((bytes[offset + 1].toInt() and 0xFF) shl 8)

    private fun readUInt32Le(
        bytes: ByteArray,
        offset: Int,
    ): Long =
        (bytes[offset].toLong() and 0xFF) or
            ((bytes[offset + 1].toLong() and 0xFF) shl 8) or
            ((bytes[offset + 2].toLong() and 0xFF) shl 16) or
            ((bytes[offset + 3].toLong() and 0xFF) shl 24)

    private data class DetectedContent(
        val contentType: String,
        val mediaKind: CloudFileMediaKind,
    )

    private data class UploadLimit(
        val label: String,
        val maxBytes: Long,
    )

    companion object {
        private val DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd")
        private const val MAX_FILENAME_CODE_POINTS = 255L
        private const val MAX_FILENAME_METADATA_ENCODED_BYTES = 1024
        private const val HWPX_CONTENT_TYPE = "application/haansofthwpx"
        private const val ZIP_CONTENT_TYPE = "application/zip"
        private const val HWPX_MANIFEST_ENTRY = "Contents/content.hpf"
        private const val ZIP_EOCD_MIN_SIZE = 22
        private const val ZIP_EOCD_MAX_SEARCH_LENGTH = ZIP_EOCD_MIN_SIZE + 0xFFFF
        private const val ZIP_EOCD_TOTAL_ENTRY_COUNT_OFFSET = 10
        private const val ZIP_EOCD_DIRECTORY_SIZE_OFFSET = 12
        private const val ZIP_EOCD_DIRECTORY_OFFSET = 16
        private const val ZIP_CENTRAL_DIRECTORY_HEADER_SIZE = 46
        private const val ZIP_CENTRAL_DIRECTORY_NAME_LENGTH_OFFSET = 28
        private const val ZIP_CENTRAL_DIRECTORY_EXTRA_LENGTH_OFFSET = 30
        private const val ZIP_CENTRAL_DIRECTORY_COMMENT_LENGTH_OFFSET = 32
        private val HWPX_DOCUMENT_ENTRIES =
            setOf(
                "Contents/header.xml",
                "Contents/section0.xml",
                "META-INF/container.xml",
            )
        private val ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE =
            byteArrayOf(0x50.toByte(), 0x4B.toByte(), 0x05.toByte(), 0x06.toByte())
        private val ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE =
            byteArrayOf(0x50.toByte(), 0x4B.toByte(), 0x01.toByte(), 0x02.toByte())
        private val ZIP_SIGNATURES =
            setOf(
                listOf(0x50.toByte(), 0x4B.toByte(), 0x03.toByte(), 0x04.toByte()),
                listOf(0x50.toByte(), 0x4B.toByte(), 0x05.toByte(), 0x06.toByte()),
                listOf(0x50.toByte(), 0x4B.toByte(), 0x07.toByte(), 0x08.toByte()),
            )
        private val CONTENT_TYPE_ALIASES =
            mapOf(
                "image/jpg" to "image/jpeg",
                "image/pjpeg" to "image/jpeg",
                "image/x-png" to "image/png",
                "image/x-webp" to "image/webp",
                "application/x-hwpx" to HWPX_CONTENT_TYPE,
                "application/x-zip-compressed" to ZIP_CONTENT_TYPE,
            )
        private val KNOWN_CONTENT_TYPES =
            setOf(
                "application/pdf",
                HWPX_CONTENT_TYPE,
                ZIP_CONTENT_TYPE,
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
                "video/mp4",
                "video/webm",
            )
    }
}
