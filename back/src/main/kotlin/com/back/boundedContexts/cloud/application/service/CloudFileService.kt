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
import java.nio.charset.StandardCharsets
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
        contentType: String?,
        bytes: ByteArray,
        folderPath: String?,
    ): CloudFileDto {
        if (bytes.isEmpty()) throw AppException("400-1", "클라우드 파일이 비어 있습니다.")
        if (bytes.size.toLong() > cloudStorageProperties.maxFileSizeBytes) {
            throw AppException(
                "413-1",
                "클라우드 파일은 ${formatFileSizeLimit(cloudStorageProperties.maxFileSizeBytes)} 이하여야 합니다.",
            )
        }

        val normalizedFolderPath = normalizeFolderPath(folderPath)
        val safeFilename = normalizeFilename(originalFilename)
        val detected = detectContent(bytes, contentType)
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
            decoded
                .ifBlank { fallback }
                .replace(Regex("[\\r\\n\\t]"), " ")
                .replace(Regex("[^A-Za-z0-9가-힣._()\\[\\] -]"), "_")
                .take(255)
                .trim()

        return cleaned.ifBlank { fallback }
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

    private fun formatFileSizeLimit(maxFileSizeBytes: Long): String {
        val limitMb = (maxFileSizeBytes + (1024 * 1024) - 1) / (1024 * 1024)
        return "${limitMb}MB"
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
    ): DetectedContent {
        val normalizedDeclared = normalizeContentType(declaredContentType)
        val detected =
            detectFromSignature(bytes)
                ?: throw AppException("400-1", "지원하지 않는 클라우드 파일 형식입니다.")

        if (
            normalizedDeclared != null &&
            normalizedDeclared in KNOWN_CONTENT_TYPES &&
            normalizedDeclared != detected.contentType
        ) {
            throw AppException("400-1", "파일 내용과 콘텐츠 타입이 일치하지 않습니다.")
        }

        return detected
    }

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

    private fun detectFromSignature(bytes: ByteArray): DetectedContent? {
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

        return null
    }

    private data class DetectedContent(
        val contentType: String,
        val mediaKind: CloudFileMediaKind,
    )

    companion object {
        private val DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd")
        private val CONTENT_TYPE_ALIASES =
            mapOf(
                "image/jpg" to "image/jpeg",
                "image/pjpeg" to "image/jpeg",
                "image/x-png" to "image/png",
                "image/x-webp" to "image/webp",
            )
        private val KNOWN_CONTENT_TYPES =
            setOf(
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/gif",
                "image/webp",
                "video/mp4",
                "video/webm",
            )
    }
}
