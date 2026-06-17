package com.back.boundedContexts.cloud.application.service

import com.back.boundedContexts.cloud.application.port.output.CloudFileRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadPartRepositoryPort
import com.back.boundedContexts.cloud.application.port.output.CloudVideoUploadSessionRepositoryPort
import com.back.boundedContexts.cloud.model.CloudFile
import com.back.boundedContexts.cloud.model.CloudFileMediaKind
import com.back.boundedContexts.cloud.model.CloudVideoUploadPart
import com.back.boundedContexts.cloud.model.CloudVideoUploadSession
import com.back.boundedContexts.cloud.model.CloudVideoUploadSessionStatus
import com.back.global.exception.application.AppException
import com.back.global.storage.application.port.output.CloudStoragePort
import com.back.global.storage.config.CloudStorageProperties
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.text.Normalizer
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import kotlin.math.ceil

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
    val completedFileId: Long?,
)

data class CloudVideoUploadPartDto(
    val partNumber: Int,
    val byteSize: Long,
)

data class CloudVideoUploadPartResultDto(
    val session: CloudVideoUploadSessionDto,
    val part: CloudVideoUploadPartDto,
)

@Service
class CloudVideoUploadSessionService(
    private val sessionRepository: CloudVideoUploadSessionRepositoryPort,
    private val partRepository: CloudVideoUploadPartRepositoryPort,
    private val cloudFileRepository: CloudFileRepositoryPort,
    private val cloudStoragePort: CloudStoragePort,
    private val cloudStorageProperties: CloudStorageProperties = CloudStorageProperties(),
    private val clock: Clock = Clock.systemUTC(),
) {
    @Transactional
    fun createSession(
        ownerMemberId: Long,
        originalFilename: String?,
        contentType: String?,
        byteSize: Long,
        folderPath: String?,
    ): CloudVideoUploadSessionDto {
        val safeFilename = normalizeFilename(originalFilename)
        val normalizedFolderPath = normalizeFolderPath(folderPath)
        val normalizedContentType = normalizeVideoContentType(contentType, safeFilename)
        validateTotalSize(byteSize)
        val partSizeBytes = resolvePartSizeBytes()
        val totalParts = ceil(byteSize.toDouble() / partSizeBytes.toDouble()).toInt()
        val objectKey =
            buildObjectKey(
                ownerMemberId = ownerMemberId,
                folderPath = normalizedFolderPath,
                originalFilename = safeFilename,
            )
        val upload =
            cloudStoragePort.initiateMultipartUpload(
                CloudStoragePort.MultipartUploadInitRequest(
                    objectKey = objectKey,
                    contentType = normalizedContentType,
                    originalFilename = safeFilename,
                ),
            )
        val expiresAt = clock.instant().plusSeconds(cloudStorageProperties.cloudVideoResumableExpiresSeconds.coerceAtLeast(60))
        val session =
            sessionRepository.save(
                CloudVideoUploadSession(
                    ownerMemberId = ownerMemberId,
                    objectKey = upload.objectKey,
                    uploadId = upload.uploadId,
                    originalFilename = safeFilename,
                    contentType = normalizedContentType,
                    byteSize = byteSize,
                    folderPath = normalizedFolderPath,
                    partSizeBytes = partSizeBytes,
                    totalParts = totalParts,
                    expiresAt = expiresAt,
                ),
            )

        return session.toDto(emptyList())
    }

    @Transactional(readOnly = true)
    fun getSession(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudVideoUploadSessionDto {
        val session = findOwnedSession(ownerMemberId, sessionId)
        val parts = partRepository.findBySessionId(session.id)
        return session.toDto(parts)
    }

    @Transactional
    fun uploadPart(
        ownerMemberId: Long,
        sessionId: Long,
        partNumber: Int,
        bytes: ByteArray,
    ): CloudVideoUploadPartResultDto {
        val session = findMutableSession(ownerMemberId, sessionId)
        validatePartNumber(session, partNumber)
        validatePartBytes(session, partNumber, bytes)
        validateFirstPartSignature(session, partNumber, bytes)

        val existing = partRepository.findBySessionIdAndPartNumber(session.id, partNumber)
        if (existing != null) {
            if (existing.byteSize != bytes.size.toLong()) {
                throw AppException("409-1", "이미 다른 크기의 업로드 조각이 저장되어 있습니다.")
            }
            return CloudVideoUploadPartResultDto(
                session = session.toDto(partRepository.findBySessionId(session.id)),
                part = existing.toDto(),
            )
        }

        val uploadResult =
            cloudStoragePort.uploadMultipartPart(
                CloudStoragePort.MultipartUploadPartRequest(
                    objectKey = session.objectKey,
                    uploadId = session.uploadId,
                    partNumber = partNumber,
                    bytes = bytes,
                ),
            )
        val savedPart =
            partRepository.save(
                CloudVideoUploadPart(
                    sessionId = session.id,
                    partNumber = partNumber,
                    eTag = uploadResult.eTag,
                    byteSize = bytes.size.toLong(),
                ),
            )
        val parts = partRepository.findBySessionId(session.id)

        return CloudVideoUploadPartResultDto(
            session = session.toDto(parts),
            part = savedPart.toDto(),
        )
    }

    @Transactional
    fun complete(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudFileDto {
        val session = findMutableSession(ownerMemberId, sessionId)
        val parts = partRepository.findBySessionId(session.id).sortedBy { it.partNumber }
        if (parts.size != session.totalParts || parts.map { it.partNumber } != (1..session.totalParts).toList()) {
            throw AppException("409-1", "아직 업로드되지 않은 동영상 조각이 있습니다.")
        }

        cloudStoragePort.completeMultipartUpload(
            CloudStoragePort.MultipartUploadCompleteRequest(
                objectKey = session.objectKey,
                uploadId = session.uploadId,
                parts =
                    parts.map {
                        CloudStoragePort.CompletedMultipartUploadPart(
                            partNumber = it.partNumber,
                            eTag = it.eTag,
                        )
                    },
            ),
        )

        val file =
            cloudFileRepository.save(
                CloudFile.create(
                    ownerMemberId = session.ownerMemberId,
                    objectKey = session.objectKey,
                    originalFilename = session.originalFilename,
                    contentType = session.contentType,
                    byteSize = session.byteSize,
                    mediaKind = CloudFileMediaKind.VIDEO,
                    folderPath = session.folderPath,
                    checksumSha256 = null,
                ),
            )
        session.complete(file.id, clock.instant())
        sessionRepository.save(session)

        return file.toDto()
    }

    @Transactional
    fun cancel(
        ownerMemberId: Long,
        sessionId: Long,
    ) {
        val session = findOwnedSession(ownerMemberId, sessionId)
        if (session.status != CloudVideoUploadSessionStatus.IN_PROGRESS) return

        cloudStoragePort.abortMultipartUpload(
            CloudStoragePort.MultipartUploadAbortRequest(
                objectKey = session.objectKey,
                uploadId = session.uploadId,
            ),
        )
        partRepository.deleteBySessionId(session.id)
        session.cancel(clock.instant())
        sessionRepository.save(session)
    }

    private fun findOwnedSession(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudVideoUploadSession =
        sessionRepository.findByIdAndOwner(sessionId, ownerMemberId)
            ?: throw AppException("404-1", "대용량 업로드 세션을 찾을 수 없습니다.")

    private fun findMutableSession(
        ownerMemberId: Long,
        sessionId: Long,
    ): CloudVideoUploadSession {
        val session = findOwnedSession(ownerMemberId, sessionId)
        if (session.status != CloudVideoUploadSessionStatus.IN_PROGRESS) {
            throw AppException("409-1", "이미 종료된 대용량 업로드 세션입니다.")
        }
        if (session.expiresAt <= clock.instant()) {
            cloudStoragePort.abortMultipartUpload(
                CloudStoragePort.MultipartUploadAbortRequest(
                    objectKey = session.objectKey,
                    uploadId = session.uploadId,
                ),
            )
            session.expire(clock.instant())
            sessionRepository.save(session)
            throw AppException("410-1", "대용량 업로드 세션이 만료되었습니다.")
        }

        return session
    }

    private fun validateTotalSize(byteSize: Long) {
        if (byteSize <= 0) throw AppException("400-1", "동영상 파일 크기가 올바르지 않습니다.")
        val maxBytes = cloudStorageProperties.cloudVideoResumableMaxFileSizeBytes
        if (byteSize > maxBytes) {
            throw AppException("413-1", "클라우드 동영상 파일은 ${formatFileSizeLimit(maxBytes)} 이하여야 합니다.")
        }
    }

    private fun validatePartNumber(
        session: CloudVideoUploadSession,
        partNumber: Int,
    ) {
        if (partNumber !in 1..session.totalParts) {
            throw AppException("400-1", "업로드 조각 번호가 올바르지 않습니다.")
        }
    }

    private fun validatePartBytes(
        session: CloudVideoUploadSession,
        partNumber: Int,
        bytes: ByteArray,
    ) {
        if (bytes.isEmpty()) throw AppException("400-1", "업로드 조각이 비어 있습니다.")
        val expectedSize =
            if (partNumber == session.totalParts) {
                session.byteSize - (session.partSizeBytes * (partNumber - 1))
            } else {
                session.partSizeBytes
            }
        if (bytes.size.toLong() != expectedSize) {
            throw AppException("400-1", "업로드 조각 크기가 올바르지 않습니다.")
        }
    }

    private fun validateFirstPartSignature(
        session: CloudVideoUploadSession,
        partNumber: Int,
        bytes: ByteArray,
    ) {
        if (partNumber != 1) return
        val detected =
            detectVideoFromSignature(bytes)
                ?: throw AppException("400-1", "지원하지 않는 동영상 파일 형식입니다.")
        if (detected != session.contentType) {
            throw AppException("400-1", "동영상 파일 내용과 콘텐츠 타입이 일치하지 않습니다.")
        }
    }

    private fun normalizeVideoContentType(
        contentType: String?,
        filename: String,
    ): String {
        val normalized =
            contentType
                ?.substringBefore(";")
                ?.trim()
                ?.lowercase(Locale.ROOT)
                .orEmpty()
        val extension = filename.substringAfterLast(".", "").lowercase(Locale.ROOT)
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
        return fromContentType ?: fromExtension ?: throw AppException("400-1", "지원하지 않는 동영상 파일 형식입니다.")
    }

    private fun detectVideoFromSignature(bytes: ByteArray): String? {
        if (bytes.size >= 12 && bytes.copyOfRange(4, 8).toString(Charsets.US_ASCII) == "ftyp") return "video/mp4"
        if (
            bytes.size >= 4 &&
            bytes[0] == 0x1A.toByte() &&
            bytes[1] == 0x45.toByte() &&
            bytes[2] == 0xDF.toByte() &&
            bytes[3] == 0xA3.toByte()
        ) {
            return "video/webm"
        }
        return null
    }

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

        return raw
            .split('/')
            .joinToString("/") { segment ->
                segment.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(80)
            }.take(500)
    }

    private fun normalizeFilename(originalFilename: String?): String {
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
                .ifBlank { "cloud-video" }
                .replace(Regex("[\\r\\n\\t]"), " ")
                .replace(Regex("[/\\\\]"), "_")
                .replace(Regex("[\\p{Cc}\\p{Cf}\\p{Cs}]"), "")
                .replace(Regex("\\s+"), " ")
                .takeMetadataEncodedBytes(MAX_FILENAME_METADATA_ENCODED_BYTES)
                .takeCodePoints(MAX_FILENAME_CODE_POINTS)
                .trim()

        return cleaned.ifBlank { "cloud-video" }
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

    private fun String.takeCodePoints(maxCodePoints: Long): String {
        val codePoints = codePoints().limit(maxCodePoints).toArray()
        return String(codePoints, 0, codePoints.size)
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

    private fun resolvePartSizeBytes(): Long {
        val configured = cloudStorageProperties.cloudVideoResumablePartSizeBytes
        val minPartBytes = 5L * 1024 * 1024
        val maxPartBytes = cloudStorageProperties.maxFileSizeBytes.coerceAtLeast(minPartBytes)
        return configured.coerceIn(minPartBytes, maxPartBytes)
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

    private fun CloudVideoUploadSession.toDto(parts: List<CloudVideoUploadPart>): CloudVideoUploadSessionDto =
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
        )

    private fun CloudVideoUploadPart.toDto(): CloudVideoUploadPartDto =
        CloudVideoUploadPartDto(
            partNumber = partNumber,
            byteSize = byteSize,
        )

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

    companion object {
        private val DATE_PATH_FORMATTER = DateTimeFormatter.ofPattern("yyyy/MM/dd")
        private const val MAX_FILENAME_CODE_POINTS = 255L
        private const val MAX_FILENAME_METADATA_ENCODED_BYTES = 1024
    }
}
